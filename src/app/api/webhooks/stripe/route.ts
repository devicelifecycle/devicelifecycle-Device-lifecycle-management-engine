// ============================================================================
// STRIPE WEBHOOK ENDPOINT — signature verification + idempotent processing
// ============================================================================
// Replayed webhooks are normal (Stripe retries), not exceptional. The
// webhook_events table deduplicates by provider_event_id, so reprocessing
// is a safe no-op.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { isStripeConfigured, stripeProvider, getWebhookSecret } from '@/lib/payment-providers/stripe'
import {
  getSubscription, transitionSubscription, renewSubscription,
} from '@/lib/subscription-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripeProvider.verifyWebhook({ rawBody, signature }) as Stripe.Event
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Idempotency: skip if we've already processed this event
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('provider', 'stripe')
    .eq('provider_event_id', event.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Store the event
  await supabase.from('webhook_events').insert({
    provider: 'stripe',
    provider_event_id: event.id,
    event_type: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
    processed: false,
  })

  try {
    await handleEvent(supabase, event)

    // Mark as processed
    await supabase
      .from('webhook_events')
      .update({ processed: true })
      .eq('provider', 'stripe')
      .eq('provider_event_id', event.id)
  } catch (err) {
    console.error(`Stripe webhook handler error for ${event.type}:`, err)
  }

  return NextResponse.json({ received: true })
}

/**
 * The app already wrote a payment_charges row for charges it started (recurring
 * renewal, dunning retry, invoice "Pay now"). Update that row instead of adding
 * a second one for the same PaymentIntent. Returns true when one existed.
 */
async function updateKnownCharge(
  supabase: ReturnType<typeof createServiceRoleClient>, piId: string, patch: Record<string, unknown>,
): Promise<boolean> {
  const { data } = await supabase.from('payment_charges').select('id').eq('provider_charge_id', piId).limit(1).maybeSingle()
  if (!data) return false
  await supabase.from('payment_charges').update(patch).eq('id', data.id)
  return true
}

/**
 * An invoice card payment normally settles inside the Pay-now request. If it
 * needed bank confirmation (3-D Secure) it succeeds later, here: record it on
 * the invoice exactly once — only when our charge row was not already
 * 'succeeded' (the row flip is the once-only guard).
 */
async function settleInvoiceFromWebhook(supabase: ReturnType<typeof createServiceRoleClient>, pi: Stripe.PaymentIntent) {
  const invoiceId = pi.metadata?.invoice_id
  const { data: row } = await supabase.from('payment_charges').select('id, status')
    .eq('provider_charge_id', pi.id).limit(1).maybeSingle()
  if (!row || row.status === 'succeeded' || !invoiceId) {
    if (row && row.status !== 'succeeded') await supabase.from('payment_charges').update({ status: 'succeeded' }).eq('id', row.id)
    return
  }
  const { data: flipped } = await supabase.from('payment_charges').update({ status: 'succeeded' })
    .eq('id', row.id).neq('status', 'succeeded').select('id')
  if (!flipped?.length) return // another delivery already settled it
  await supabase.rpc('record_invoice_payment', {
    p_invoice_id: invoiceId, p_kind: 'payment', p_amount: pi.amount / 100,
    p_note: `Card payment confirmed by bank (${pi.id})`, p_created_by: null,
  })
  const { data: inv } = await supabase.from('invoices').select('status, total').eq('id', invoiceId).maybeSingle()
  const { data: pays } = await supabase.from('invoice_payments').select('kind, amount').eq('invoice_id', invoiceId)
  const net = (pays ?? []).reduce((s, p) => s + (p.kind === 'refund' ? -1 : 1) * Number(p.amount ?? 0), 0)
  if (inv?.status === 'sent' && net >= Number(inv.total ?? 0) - 0.005) {
    await supabase.from('invoices').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', invoiceId)
  }
}

async function handleEvent(supabase: ReturnType<typeof createServiceRoleClient>, event: Stripe.Event) {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      const tenantId = pi.metadata?.tenant_id
      if (!tenantId) break

      // An invoice payment is settled by the Pay-now request itself and must
      // never renew or reactivate a subscription.
      if (pi.metadata?.purpose === 'invoice') {
        await settleInvoiceFromWebhook(supabase, pi)
        break
      }
      if (await updateKnownCharge(supabase, pi.id, { status: 'succeeded' })) {
        // The renewal path already renewed on its own success.
        break
      }

      // Record the successful charge
      await supabase.from('payment_charges').upsert({
        tenant_id: tenantId,
        provider: 'stripe',
        provider_charge_id: pi.id,
        amount_cents: pi.amount,
        currency: pi.currency.toUpperCase(),
        status: 'succeeded',
        idempotency_key: `stripe_pi_${pi.id}`,
        metadata: { stripe_event_id: event.id },
      }, { onConflict: 'idempotency_key' })

      // If this was for a subscription renewal, renew the period
      const sub = await getSubscription(supabase, tenantId)
      if (sub && (sub.status === 'active' || sub.status === 'past_due')) {
        const periodEnd = new Date(sub.current_period_end).getTime()
        if (Date.now() >= periodEnd) {
          await renewSubscription(supabase, sub.id)
        } else if (sub.status === 'past_due') {
          await transitionSubscription(supabase, sub.id, 'active', {
            reason: 'payment_succeeded', chargeId: pi.id,
          })
        }
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent
      const tenantId = pi.metadata?.tenant_id
      if (!tenantId) break

      // A failed invoice card payment leaves the invoice outstanding; it must
      // not push the subscription into past_due.
      if (pi.metadata?.purpose === 'invoice') {
        await updateKnownCharge(supabase, pi.id, { status: 'failed', failure_reason: pi.last_payment_error?.message ?? 'Payment failed' })
        break
      }

      await supabase.from('payment_charges').upsert({
        tenant_id: tenantId,
        provider: 'stripe',
        provider_charge_id: pi.id,
        amount_cents: pi.amount,
        currency: pi.currency.toUpperCase(),
        status: 'failed',
        failure_reason: pi.last_payment_error?.message ?? 'Payment failed',
        idempotency_key: `stripe_pi_${pi.id}`,
        metadata: { stripe_event_id: event.id },
      }, { onConflict: 'idempotency_key' })

      // Mark subscription as past_due
      const sub = await getSubscription(supabase, tenantId)
      if (sub && sub.status === 'active') {
        await transitionSubscription(supabase, sub.id, 'past_due', {
          reason: 'payment_failed', chargeId: pi.id,
        })
      }
      break
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      const tenantId = charge.metadata?.tenant_id
      if (!tenantId) break

      // Idempotency key uses the Stripe event ID — each refund webhook is a
      // distinct event, so replays dedup correctly and separate partial refunds
      // each get their own row.
      await supabase.from('payment_charges').upsert({
        tenant_id: tenantId,
        provider: 'stripe',
        provider_charge_id: charge.id,
        amount_cents: -(charge.amount_refunded ?? 0),
        currency: charge.currency.toUpperCase(),
        status: 'refunded',
        idempotency_key: `stripe_refund_${event.id}`,
        metadata: { stripe_event_id: event.id },
      }, { onConflict: 'idempotency_key' })
      break
    }
  }
}
