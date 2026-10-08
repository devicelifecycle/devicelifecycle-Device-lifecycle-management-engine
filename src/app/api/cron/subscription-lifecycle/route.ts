// ============================================================================
// SUBSCRIPTION LIFECYCLE CRON — advance periods, expire trials, mark past-due
// ============================================================================
// Runs nightly. For each subscription whose period has ended:
//   trialing  → expired   (trial ran out without converting)
//   active    → past_due  (charge failed or no payment method)
//   cancelled → expired   (cancel_at_period_end + period ended)
//   past_due  → expired   (dunning grace exhausted — access already read-only)
//
// Renewals (active → renewed active) happen when a charge succeeds, NOT here.
// This cron only handles the negative path: what happens when nothing pays.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { readServerEnv } from '@/lib/server-env'
import { logCronSuccess, logCronFailure } from '@/lib/cron-logging'
import { DUNNING_GRACE_DAYS } from '@/lib/subscription'
import { EmailService } from '@/services/email.service'
import { getAppPath } from '@/lib/app-url'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
const CRON_NAME = 'subscription-lifecycle'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(request: NextRequest) {
  const startedAt = new Date()
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    if (!cronSecret) {
      console.error('CRON_SECRET not set — subscription-lifecycle cron disabled')
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const now = new Date().toISOString()
    const graceCutoff = new Date(Date.now() - DUNNING_GRACE_DAYS * 86_400_000).toISOString()
    const billingUrl = getAppPath('/var/billing')

    async function notifyTenantAdmins(
      tenantId: string,
      planSlug: string,
      sendFn: (to: string, name: string, plan: string, tenantId: string) => Promise<boolean>,
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
          await sendFn(admin.email, admin.full_name ?? 'Admin', planSlug, tenantId)
        }
      }
    }

    const result = {
      trialsExpired: 0,
      cancelledExpired: 0,
      markedPastDue: 0,
      pastDueExpired: 0,
      emailsSent: 0,
      errors: [] as string[],
    }

    // 1. Expire trials whose period has ended
    const { data: expiredTrials } = await supabase
      .from('subscriptions')
      .select('id, tenant_id, plan_slug')
      .eq('status', 'trialing')
      .lte('current_period_end', now)
      .limit(500)

    for (const sub of expiredTrials ?? []) {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'expired' })
        .eq('id', sub.id)
        .eq('status', 'trialing')
      if (error) {
        result.errors.push(`trial_expire:${sub.id}:${error.message}`)
      } else {
        result.trialsExpired++
        await supabase.from('subscription_events').insert({
          subscription_id: sub.id,
          event_type: 'trial_expired',
          from_status: 'trialing',
          to_status: 'expired',
          metadata: { cron: true },
        })
        await notifyTenantAdmins(sub.tenant_id, sub.plan_slug, async (to, name, plan, tid) => {
          const sent = await EmailService.sendSubscriptionExpiredEmail({ to, recipientName: name, planName: plan, reason: 'Trial period ended without a payment method', tenantId: tid })
          if (sent) result.emailsSent++
          return sent
        })
      }
    }

    // 2. Expire cancelled subscriptions past their period end
    const { data: cancelledDue } = await supabase
      .from('subscriptions')
      .select('id, tenant_id, plan_slug')
      .eq('status', 'cancelled')
      .eq('cancel_at_period_end', true)
      .lte('current_period_end', now)
      .limit(500)

    for (const sub of cancelledDue ?? []) {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'expired' })
        .eq('id', sub.id)
        .eq('status', 'cancelled')
      if (error) {
        result.errors.push(`cancelled_expire:${sub.id}:${error.message}`)
      } else {
        result.cancelledExpired++
        await supabase.from('subscription_events').insert({
          subscription_id: sub.id,
          event_type: 'cancelled_period_ended',
          from_status: 'cancelled',
          to_status: 'expired',
          metadata: { cron: true },
        })
      }
    }

    // 3. Mark active subscriptions past their period end as past_due
    //    (if they haven't been renewed by a charge)
    const { data: activeDue } = await supabase
      .from('subscriptions')
      .select('id, tenant_id, plan_slug')
      .eq('status', 'active')
      .eq('cancel_at_period_end', false)
      .lte('current_period_end', now)
      .limit(500)

    for (const sub of activeDue ?? []) {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'past_due', past_due_since: now })
        .eq('id', sub.id)
        .eq('status', 'active')
      if (error) {
        result.errors.push(`mark_past_due:${sub.id}:${error.message}`)
      } else {
        result.markedPastDue++
        await supabase.from('subscription_events').insert({
          subscription_id: sub.id,
          event_type: 'marked_past_due',
          from_status: 'active',
          to_status: 'past_due',
          metadata: { cron: true },
        })
        await notifyTenantAdmins(sub.tenant_id, sub.plan_slug, async (to, name, plan, tid) => {
          const sent = await EmailService.sendSubscriptionPastDueEmail({ to, recipientName: name, planName: plan, graceDays: DUNNING_GRACE_DAYS, billingUrl, tenantId: tid })
          if (sent) result.emailsSent++
          return sent
        })
      }
    }

    // 4. Expire past_due subscriptions whose grace period has elapsed
    const { data: pastDueExpired } = await supabase
      .from('subscriptions')
      .select('id, tenant_id, plan_slug')
      .eq('status', 'past_due')
      .lte('past_due_since', graceCutoff)
      .limit(500)

    for (const sub of pastDueExpired ?? []) {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'expired' })
        .eq('id', sub.id)
        .eq('status', 'past_due')
      if (error) {
        result.errors.push(`past_due_expire:${sub.id}:${error.message}`)
      } else {
        result.pastDueExpired++
        await supabase.from('subscription_events').insert({
          subscription_id: sub.id,
          event_type: 'dunning_grace_exhausted',
          from_status: 'past_due',
          to_status: 'expired',
          metadata: { cron: true, graceDays: DUNNING_GRACE_DAYS },
        })
        await notifyTenantAdmins(sub.tenant_id, sub.plan_slug, async (to, name, plan, tid) => {
          const sent = await EmailService.sendSubscriptionExpiredEmail({ to, recipientName: name, planName: plan, reason: `Payment overdue for ${DUNNING_GRACE_DAYS} days — dunning grace exhausted`, tenantId: tid })
          if (sent) result.emailsSent++
          return sent
        })
      }
    }

    await logCronSuccess(CRON_NAME, startedAt, result)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Subscription lifecycle cron failed:', error)
    await logCronFailure(CRON_NAME, startedAt, error)
    return NextResponse.json({ error: 'Subscription lifecycle run failed' }, { status: 500 })
  }
}
