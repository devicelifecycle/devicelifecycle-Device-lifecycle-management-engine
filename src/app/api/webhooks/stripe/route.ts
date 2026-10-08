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

async function handleEvent(supabase: ReturnType<typeof createServiceRoleClient>, event: Stripe.Event) {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      const tenantId = pi.metadata?.tenant_id
      if (!tenantId) break

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

      await supabase.from('payment_charges').insert({
        tenant_id: tenantId,
        provider: 'stripe',
        provider_charge_id: charge.id,
        amount_cents: -(charge.amount_refunded ?? 0),
        currency: charge.currency.toUpperCase(),
        status: 'refunded',
        idempotency_key: `stripe_refund_${charge.id}_${Date.now()}`,
        metadata: { stripe_event_id: event.id },
      })
      break
    }
  }
}
