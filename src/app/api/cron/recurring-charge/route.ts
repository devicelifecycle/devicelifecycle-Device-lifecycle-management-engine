// ============================================================================
// RECURRING CHARGE CRON — bill active subscriptions whose period has ended
// ============================================================================
// Runs daily, before subscription-lifecycle. For each active subscription
// whose current_period_end ≤ now and cancel_at_period_end = false:
//   1. Resolve the plan tier and compute the charge amount
//   2. Apply any credit balance first, then charge the remainder
//   3. On success: renew the subscription (advance the period)
//   4. On failure: subscription-lifecycle will mark it past_due on its run
//
// Trialing subscriptions are NOT charged here — they convert to active
// (and start owing) only after the customer adds a payment method and
// explicitly converts, which is a separate flow.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { readServerEnv } from '@/lib/server-env'
import { logCronSuccess, logCronFailure } from '@/lib/cron-logging'
import { hasProvider, getProvider } from '@/lib/payment-provider'
import { initStripeProvider } from '@/lib/payment-providers/stripe'
import { renewSubscription } from '@/lib/subscription-service'
import { tierBySlug } from '@/lib/plan-tiers'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
const CRON_NAME = 'recurring-charge'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(request: NextRequest) {
  const startedAt = new Date()
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    if (!cronSecret) {
      console.error('CRON_SECRET not set — recurring-charge cron disabled')
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    initStripeProvider()
    if (!hasProvider('stripe')) {
      await logCronSuccess(CRON_NAME, startedAt, { skipped: true, reason: 'no_payment_provider' })
      return NextResponse.json({ success: true, skipped: true, reason: 'No payment provider configured' })
    }

    const supabase = createServiceRoleClient()
    const provider = getProvider('stripe')
    const now = new Date().toISOString()

    const result = {
      checked: 0,
      charged: 0,
      renewed: 0,
      coveredByCredit: 0,
      failed: 0,
      skippedNoMethod: 0,
      skippedNoPrice: 0,
      errors: [] as string[],
    }

    // Active subscriptions whose period has ended and are not set to cancel
    const { data: dueSubs } = await supabase
      .from('subscriptions')
      .select('id, tenant_id, plan_slug, billing_interval, payment_method_id, credit_balance_cents')
      .eq('status', 'active')
      .eq('cancel_at_period_end', false)
      .lte('current_period_end', now)
      .limit(500)

    for (const sub of dueSubs ?? []) {
      result.checked++

      const tier = tierBySlug(sub.plan_slug)
      if (!tier?.monthlyPrice) {
        result.skippedNoPrice++
        continue
      }

      const grossCents = Math.round(
        tier.monthlyPrice * 100 * (sub.billing_interval === 'year' ? 12 : 1),
      )

      // Apply credit balance
      const creditCents = sub.credit_balance_cents ?? 0
      const netChargeCents = Math.max(0, grossCents - creditCents)
      const creditUsed = Math.min(creditCents, grossCents)

      if (netChargeCents === 0) {
        // Fully covered by credit
        if (creditUsed > 0) {
          await supabase
            .from('subscriptions')
            .update({ credit_balance_cents: creditCents - creditUsed })
            .eq('id', sub.id)
        }
        await renewSubscription(supabase, sub.id)
        await supabase.from('subscription_events').insert({
          subscription_id: sub.id,
          event_type: 'charge_covered_by_credit',
          from_status: 'active',
          to_status: 'active',
          metadata: { grossCents, creditUsed, netChargeCents: 0 },
        })
        result.coveredByCredit++
        result.renewed++
        continue
      }

      if (!sub.payment_method_id) {
        result.skippedNoMethod++
        continue
      }

      // Look up provider payment method
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('provider_customer_id, provider_method_id')
        .eq('id', sub.payment_method_id)
        .maybeSingle()

      if (!pm?.provider_customer_id || !pm?.provider_method_id) {
        result.skippedNoMethod++
        continue
      }

      const periodDate = new Date().toISOString().slice(0, 10)
      const idempotencyKey = `recurring_${sub.id}_${periodDate}`

      try {
        const chargeResult = await provider.charge({
          providerCustomerId: pm.provider_customer_id,
          providerMethodId: pm.provider_method_id,
          amountCents: netChargeCents,
          currency: 'CAD',
          idempotencyKey,
          description: `Subscription renewal — ${tier.name} (${sub.billing_interval})`,
          metadata: {
            tenant_id: sub.tenant_id,
            subscription_id: sub.id,
          },
        })

        if (chargeResult.status === 'succeeded') {
          // Deduct credit used
          if (creditUsed > 0) {
            await supabase
              .from('subscriptions')
              .update({ credit_balance_cents: creditCents - creditUsed })
              .eq('id', sub.id)
          }

          await renewSubscription(supabase, sub.id)

          await supabase.from('payment_charges').upsert({
            tenant_id: sub.tenant_id,
            provider: 'stripe',
            provider_charge_id: chargeResult.providerChargeId,
            amount_cents: netChargeCents,
            currency: 'CAD',
            status: 'succeeded',
            idempotency_key: idempotencyKey,
            metadata: { subscription_id: sub.id, grossCents, creditUsed },
          }, { onConflict: 'idempotency_key' })

          await supabase.from('subscription_events').insert({
            subscription_id: sub.id,
            event_type: 'charge_succeeded',
            from_status: 'active',
            to_status: 'active',
            metadata: {
              chargeId: chargeResult.providerChargeId,
              grossCents,
              creditUsed,
              netChargeCents,
            },
          })

          result.charged++
          result.renewed++
        } else {
          // Charge failed — subscription-lifecycle cron will mark past_due
          await supabase.from('subscription_events').insert({
            subscription_id: sub.id,
            event_type: 'charge_failed',
            from_status: 'active',
            to_status: 'active',
            metadata: {
              chargeId: chargeResult.providerChargeId,
              status: chargeResult.status,
              failureReason: chargeResult.failureReason,
              grossCents,
              netChargeCents,
            },
          })
          result.failed++
        }
      } catch (err) {
        result.errors.push(`charge:${sub.id}:${err instanceof Error ? err.message : String(err)}`)
      }
    }

    await logCronSuccess(CRON_NAME, startedAt, result)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Recurring charge cron failed:', error)
    await logCronFailure(CRON_NAME, startedAt, error)
    return NextResponse.json({ error: 'Recurring charge run failed' }, { status: 500 })
  }
}
