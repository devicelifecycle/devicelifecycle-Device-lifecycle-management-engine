// ============================================================================
// DUNNING RETRY CRON — escalating payment retries on past-due subscriptions
// ============================================================================
// Schedule: runs daily (same as subscription-lifecycle).
// For each past_due subscription, checks how many days since past_due_since
// and retries the charge on days 1, 3, 7, 14. On success → renew. On final
// failure (day 14) → subscription-lifecycle will expire it on its next run.
//
// Retry schedule is deliberately sparse: hammering a declined card daily
// annoys issuers and lowers approval rates. Days 1/3 catch transient failures,
// day 7 catches pay-day cycles, day 14 is the last attempt before expiry.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { readServerEnv } from '@/lib/server-env'
import { logCronSuccess, logCronFailure } from '@/lib/cron-logging'
import { hasProvider, getProvider } from '@/lib/payment-provider'
import { initStripeProvider } from '@/lib/payment-providers/stripe'
import { renewSubscription } from '@/lib/subscription-service'
import { tierBySlug } from '@/lib/plan-tiers'
import { EmailService } from '@/services/email.service'
import { getAppPath } from '@/lib/app-url'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
const CRON_NAME = 'dunning-retry'

const RETRY_DAYS = [1, 3, 7, 14] as const

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export async function GET(request: NextRequest) {
  const startedAt = new Date()
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    if (!cronSecret) {
      console.error('CRON_SECRET not set — dunning-retry cron disabled')
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
    const billingUrl = getAppPath('/var/billing')

    const result = {
      checked: 0,
      retried: 0,
      succeeded: 0,
      failed: 0,
      skippedNoMethod: 0,
      skippedNoPrice: 0,
      skippedNotRetryDay: 0,
      emailsSent: 0,
      errors: [] as string[],
    }

    const { data: pastDueSubs } = await supabase
      .from('subscriptions')
      .select('id, tenant_id, plan_slug, billing_interval, past_due_since, payment_method_id, credit_balance_cents')
      .eq('status', 'past_due')
      .not('past_due_since', 'is', null)
      .limit(500)

    for (const sub of pastDueSubs ?? []) {
      result.checked++
      const elapsed = daysSince(sub.past_due_since!)

      // Only retry on specific days
      if (!RETRY_DAYS.includes(elapsed as typeof RETRY_DAYS[number])) {
        result.skippedNotRetryDay++
        continue
      }

      // Check how many retries have already happened today (idempotency)
      const todayStart = new Date()
      todayStart.setUTCHours(0, 0, 0, 0)
      const { count: alreadyRetried } = await supabase
        .from('subscription_events')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_id', sub.id)
        .eq('event_type', 'dunning_retry')
        .gte('created_at', todayStart.toISOString())
      if ((alreadyRetried ?? 0) > 0) {
        result.skippedNotRetryDay++
        continue
      }

      if (!sub.payment_method_id) {
        result.skippedNoMethod++
        continue
      }

      const tier = tierBySlug(sub.plan_slug)
      if (!tier?.monthlyPrice) {
        result.skippedNoPrice++
        continue
      }

      const amountCents = Math.round(
        tier.monthlyPrice * 100 * (sub.billing_interval === 'year' ? 12 : 1),
      )

      // Look up provider customer ID
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('provider_customer_id, provider_method_id')
        .eq('id', sub.payment_method_id)
        .maybeSingle()

      if (!pm?.provider_customer_id || !pm?.provider_method_id) {
        result.skippedNoMethod++
        continue
      }

      const retryAttempt = RETRY_DAYS.indexOf(elapsed as typeof RETRY_DAYS[number]) + 1

      try {
        result.retried++
        const chargeResult = await provider.charge({
          providerCustomerId: pm.provider_customer_id,
          providerMethodId: pm.provider_method_id,
          amountCents,
          currency: 'CAD',
          idempotencyKey: `dunning_${sub.id}_day${elapsed}_${todayStart.toISOString().slice(0, 10)}`,
          description: `Subscription renewal (retry ${retryAttempt}/${RETRY_DAYS.length}) — ${tier.name}`,
          metadata: {
            tenant_id: sub.tenant_id,
            subscription_id: sub.id,
            dunning_day: String(elapsed),
          },
        })

        if (chargeResult.status === 'succeeded') {
          result.succeeded++
          await renewSubscription(supabase, sub.id)
          await supabase.from('subscription_events').insert({
            subscription_id: sub.id,
            event_type: 'dunning_retry',
            from_status: 'past_due',
            to_status: 'active',
            metadata: { day: elapsed, attempt: retryAttempt, chargeId: chargeResult.providerChargeId, result: 'succeeded' },
          })

          // Record the charge
          await supabase.from('payment_charges').upsert({
            tenant_id: sub.tenant_id,
            provider: 'stripe',
            provider_charge_id: chargeResult.providerChargeId,
            amount_cents: amountCents,
            currency: 'CAD',
            status: 'succeeded',
            idempotency_key: `dunning_${sub.id}_day${elapsed}_${todayStart.toISOString().slice(0, 10)}`,
            metadata: { subscription_id: sub.id, dunning_day: elapsed },
          }, { onConflict: 'idempotency_key' })
        } else {
          result.failed++
          await supabase.from('subscription_events').insert({
            subscription_id: sub.id,
            event_type: 'dunning_retry',
            from_status: 'past_due',
            to_status: 'past_due',
            metadata: {
              day: elapsed,
              attempt: retryAttempt,
              result: chargeResult.status,
              failureReason: chargeResult.failureReason,
            },
          })

          // Send escalating dunning email
          const remainingDays = 14 - elapsed
          await notifyTenantAdmins(supabase, sub.tenant_id, async (to, name) => {
            const sent = await EmailService.sendSubscriptionPastDueEmail({
              to,
              recipientName: name,
              planName: tier.name,
              graceDays: remainingDays,
              billingUrl,
              tenantId: sub.tenant_id,
            })
            if (sent) result.emailsSent++
            return sent
          })
        }
      } catch (err) {
        result.errors.push(`retry:${sub.id}:${err instanceof Error ? err.message : String(err)}`)
      }
    }

    await logCronSuccess(CRON_NAME, startedAt, result)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Dunning retry cron failed:', error)
    await logCronFailure(CRON_NAME, startedAt, error)
    return NextResponse.json({ error: 'Dunning retry run failed' }, { status: 500 })
  }
}

async function notifyTenantAdmins(
  supabase: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  sendFn: (to: string, name: string) => Promise<boolean>,
) {
  const { data: admins } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('tenant_id', tenantId)
    .eq('role', 'var_entity_admin')
    .eq('is_active', true)
    .limit(10)
  for (const admin of admins ?? []) {
    if (admin.email && !admin.email.endsWith('@login.local')) {
      await sendFn(admin.email, admin.full_name ?? 'Admin')
    }
  }
}
