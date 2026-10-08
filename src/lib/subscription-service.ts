// ============================================================================
// SUBSCRIPTION SERVICE — DB-backed operations using the pure engine
// ============================================================================
// Bridges the pure subscription engine (subscription.ts) to the database.
// Every write goes through the engine's rules first, then persists the result.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type Subscription, type SubscriptionStatus, type BillingInterval,
  startTrial, startPaid, accessFor, canTransition, renew, prorate, isDue,
  DEFAULT_TRIAL_DAYS,
} from './subscription'
import { tierBySlug } from './plan-tiers'

export interface SubscriptionRow {
  id: string
  tenant_id: string
  plan_slug: string
  status: SubscriptionStatus
  billing_interval: BillingInterval
  current_period_start: string
  current_period_end: string
  trial_ends_at: string | null
  cancel_at_period_end: boolean
  past_due_since: string | null
  payment_method_id: string | null
  stripe_subscription_id: string | null
  credit_balance_cents: number
  created_at: string
  updated_at: string
}

const SELECT_COLS = `
  id, tenant_id, plan_slug, status, billing_interval,
  current_period_start, current_period_end, trial_ends_at,
  cancel_at_period_end, past_due_since, payment_method_id,
  stripe_subscription_id, credit_balance_cents, created_at, updated_at
`.trim()

function rowToSub(row: SubscriptionRow): Subscription {
  return {
    status: row.status,
    planSlug: row.plan_slug,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    trialEndsAt: row.trial_ends_at,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    pastDueSince: row.past_due_since,
  }
}

async function logEvent(
  supabase: SupabaseClient,
  subscriptionId: string,
  eventType: string,
  fromStatus: SubscriptionStatus | null,
  toStatus: SubscriptionStatus | null,
  metadata: Record<string, unknown> = {},
) {
  await supabase.from('subscription_events').insert({
    subscription_id: subscriptionId,
    event_type: eventType,
    from_status: fromStatus,
    to_status: toStatus,
    metadata,
  })
}

export async function getSubscription(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(SELECT_COLS)
    .eq('tenant_id', tenantId)
    .not('status', 'eq', 'expired')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as unknown as SubscriptionRow | null
}

export async function getSubscriptionById(
  supabase: SupabaseClient,
  id: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(SELECT_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as unknown as SubscriptionRow | null
}

export async function createTrialSubscription(
  supabase: SupabaseClient,
  tenantId: string,
  planSlug: string,
  trialDays = DEFAULT_TRIAL_DAYS,
): Promise<SubscriptionRow> {
  const tier = tierBySlug(planSlug)
  if (!tier) throw new Error(`Unknown plan: ${planSlug}`)

  const existing = await getSubscription(supabase, tenantId)
  if (existing) throw new Error('Tenant already has an active subscription')

  const now = new Date().toISOString()
  const sub = startTrial(now, planSlug, trialDays)

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      tenant_id: tenantId,
      plan_slug: sub.planSlug,
      status: sub.status,
      billing_interval: 'month',
      current_period_start: sub.currentPeriodStart,
      current_period_end: sub.currentPeriodEnd,
      trial_ends_at: sub.trialEndsAt,
      cancel_at_period_end: false,
      past_due_since: null,
      credit_balance_cents: 0,
    })
    .select(SELECT_COLS)
    .single()
  if (error) throw error

  const row = data as unknown as SubscriptionRow
  await logEvent(supabase, row.id, 'trial_started', null, 'trialing', {
    planSlug, trialDays,
  })

  // Sync tenants.plan to match
  await supabase.from('tenants').update({ plan: planSlug }).eq('id', tenantId)

  return row
}

export async function createPaidSubscription(
  supabase: SupabaseClient,
  tenantId: string,
  planSlug: string,
  interval: BillingInterval = 'month',
  paymentMethodId?: string,
): Promise<SubscriptionRow> {
  const tier = tierBySlug(planSlug)
  if (!tier) throw new Error(`Unknown plan: ${planSlug}`)

  const existing = await getSubscription(supabase, tenantId)
  if (existing) throw new Error('Tenant already has an active subscription')

  const now = new Date().toISOString()
  const sub = startPaid(now, planSlug, interval)

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      tenant_id: tenantId,
      plan_slug: sub.planSlug,
      status: sub.status,
      billing_interval: interval,
      current_period_start: sub.currentPeriodStart,
      current_period_end: sub.currentPeriodEnd,
      trial_ends_at: null,
      cancel_at_period_end: false,
      past_due_since: null,
      payment_method_id: paymentMethodId ?? null,
      credit_balance_cents: 0,
    })
    .select(SELECT_COLS)
    .single()
  if (error) throw error

  const row = data as unknown as SubscriptionRow
  await logEvent(supabase, row.id, 'subscription_started', null, 'active', {
    planSlug, interval,
  })

  await supabase.from('tenants').update({ plan: planSlug }).eq('id', tenantId)

  return row
}

export async function transitionSubscription(
  supabase: SupabaseClient,
  subscriptionId: string,
  toStatus: SubscriptionStatus,
  metadata: Record<string, unknown> = {},
): Promise<SubscriptionRow> {
  const row = await getSubscriptionById(supabase, subscriptionId)
  if (!row) throw new Error('Subscription not found')

  if (!canTransition(row.status, toStatus)) {
    throw new Error(`Cannot transition from ${row.status} to ${toStatus}`)
  }

  const updates: Record<string, unknown> = { status: toStatus }

  if (toStatus === 'past_due' && !row.past_due_since) {
    updates.past_due_since = new Date().toISOString()
  }
  if (toStatus === 'active') {
    updates.past_due_since = null
  }
  if (toStatus === 'cancelled') {
    updates.cancel_at_period_end = true
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('id', subscriptionId)
    .select(SELECT_COLS)
    .single()
  if (error) throw error

  const updated = data as unknown as SubscriptionRow
  await logEvent(supabase, subscriptionId, 'status_changed', row.status, toStatus, metadata)
  return updated
}

export async function cancelSubscription(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<SubscriptionRow> {
  return transitionSubscription(supabase, subscriptionId, 'cancelled', {
    reason: 'user_cancelled',
  })
}

export async function reactivateSubscription(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<SubscriptionRow> {
  const row = await getSubscriptionById(supabase, subscriptionId)
  if (!row) throw new Error('Subscription not found')
  if (row.status !== 'cancelled') throw new Error('Only cancelled subscriptions can be reactivated')

  const periodEnd = new Date(row.current_period_end).getTime()
  if (Date.now() >= periodEnd) throw new Error('Period has already ended — start a new subscription')

  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status: 'active', cancel_at_period_end: false })
    .eq('id', subscriptionId)
    .select(SELECT_COLS)
    .single()
  if (error) throw error

  const updated = data as unknown as SubscriptionRow
  await logEvent(supabase, subscriptionId, 'reactivated', 'cancelled', 'active')
  return updated
}

export async function renewSubscription(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<SubscriptionRow> {
  const row = await getSubscriptionById(supabase, subscriptionId)
  if (!row) throw new Error('Subscription not found')

  const sub = rowToSub(row)
  const renewed = renew(sub, row.billing_interval)

  const { data, error } = await supabase
    .from('subscriptions')
    .update({
      status: renewed.status,
      current_period_start: renewed.currentPeriodStart,
      current_period_end: renewed.currentPeriodEnd,
      past_due_since: null,
    })
    .eq('id', subscriptionId)
    .select(SELECT_COLS)
    .single()
  if (error) throw error

  const updated = data as unknown as SubscriptionRow
  await logEvent(supabase, subscriptionId, 'renewed', row.status, 'active', {
    newPeriodEnd: renewed.currentPeriodEnd,
  })
  return updated
}

export async function changePlan(
  supabase: SupabaseClient,
  subscriptionId: string,
  newPlanSlug: string,
): Promise<{ subscription: SubscriptionRow; prorationAmountCents: number }> {
  const row = await getSubscriptionById(supabase, subscriptionId)
  if (!row) throw new Error('Subscription not found')
  if (row.status !== 'active' && row.status !== 'trialing') {
    throw new Error('Can only change plan on active or trialing subscriptions')
  }

  const newTier = tierBySlug(newPlanSlug)
  if (!newTier) throw new Error(`Unknown plan: ${newPlanSlug}`)

  const oldTier = tierBySlug(row.plan_slug)
  const oldPrice = oldTier?.monthlyPrice ?? 0
  const newPrice = newTier.monthlyPrice ?? 0

  const sub = rowToSub(row)
  const now = new Date().toISOString()
  const prorationResult = prorate(sub, oldPrice, newPrice, now)
  const prorationCents = Math.round(prorationResult.amount * 100)

  const updates: Record<string, unknown> = {
    plan_slug: newPlanSlug,
  }

  // Downgrade: store credit (negative proration = credit)
  if (prorationCents < 0) {
    updates.credit_balance_cents = row.credit_balance_cents + Math.abs(prorationCents)
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('id', subscriptionId)
    .select(SELECT_COLS)
    .single()
  if (error) throw error

  const updated = data as unknown as SubscriptionRow
  await logEvent(supabase, subscriptionId, 'plan_changed', null, null, {
    oldPlan: row.plan_slug,
    newPlan: newPlanSlug,
    prorationCents,
  })

  // Sync tenants.plan
  await supabase.from('tenants').update({ plan: newPlanSlug }).eq('id', row.tenant_id)

  return { subscription: updated, prorationAmountCents: prorationCents }
}

export function getAccessDecision(row: SubscriptionRow) {
  return accessFor(rowToSub(row), new Date().toISOString())
}

export function isSubscriptionDue(row: SubscriptionRow) {
  return isDue(rowToSub(row), new Date().toISOString())
}

export async function listAllSubscriptions(
  supabase: SupabaseClient,
  opts: { status?: SubscriptionStatus; page?: number; limit?: number } = {},
): Promise<{ data: SubscriptionRow[]; total: number }> {
  const page = opts.page ?? 1
  const limit = opts.limit ?? 50
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('subscriptions')
    .select(SELECT_COLS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (opts.status) query = query.eq('status', opts.status)

  const { data, error, count } = await query
  if (error) throw error
  return { data: (data ?? []) as unknown as SubscriptionRow[], total: count ?? 0 }
}

export { rowToSub }
