// ============================================================================
// SUBSCRIPTION ENGINE — lifecycle, periods, proration (pure, no I/O)
// ============================================================================
// Phase 1 of docs/DLM_COMMERCIAL_PLAN.md.
//
// Today `tenants.plan` is a label: assigning it changes what a VAR is allowed
// to do, but nothing expires, renews, lapses or can be cancelled. This module
// is the state machine that makes a plan an actual subscription — deliberately
// built and tested BEFORE any payment gateway, because none of this depends on
// how the money is collected, and all of it has to be right whichever gateway
// collects it.
//
// Pure by design: every date and money calculation here is unit-testable
// without a database or a network.

export const SUBSCRIPTION_STATUSES = [
  'trialing',   // in a free trial; full access
  'active',     // paid and current
  'past_due',   // a charge failed; still in the dunning window
  'cancelled',  // cancelled, but paid through the end of the current period
  'expired',    // period ended unpaid, or a cancelled period ran out
] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export interface Subscription {
  status: SubscriptionStatus
  planSlug: string
  /** Inclusive start of the period currently paid for (ISO). */
  currentPeriodStart: string
  /** Exclusive end of that period (ISO) — renewal falls due at this instant. */
  currentPeriodEnd: string
  trialEndsAt?: string | null
  /** Set when the customer cancels: run to period end, then expire. */
  cancelAtPeriodEnd?: boolean
  /** When the first charge failed — the clock the dunning window runs on. */
  pastDueSince?: string | null
}

export type BillingInterval = 'month' | 'year'

/** Days a past-due subscription keeps working before access is restricted. */
export const DUNNING_GRACE_DAYS = 14
/** Default trial length for a self-serve signup. */
export const DEFAULT_TRIAL_DAYS = 14

// ── Period maths ────────────────────────────────────────────────────────────

/**
 * Add one billing interval to a date, clamping the day-of-month.
 *
 * Naive month addition turns Jan 31 into Mar 3, which silently skips February
 * and bills the customer early forever after. Clamping to the last valid day
 * keeps a Jan-31 subscription on the 31st (or the 28th/29th in February) and
 * never drifts.
 */
export function addInterval(fromIso: string, interval: BillingInterval, count = 1): string {
  const d = new Date(fromIso)
  if (Number.isNaN(d.getTime())) throw new Error(`addInterval: invalid date ${fromIso}`)

  if (interval === 'year') {
    const target = new Date(d)
    target.setUTCFullYear(d.getUTCFullYear() + count)
    // Feb 29 → Feb 28 in a non-leap year.
    if (target.getUTCMonth() !== d.getUTCMonth()) target.setUTCDate(0)
    return target.toISOString()
  }

  const day = d.getUTCDate()
  const target = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth() + count, 1,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds(),
  ))
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth))
  return target.toISOString()
}

export function startTrial(nowIso: string, planSlug: string, trialDays = DEFAULT_TRIAL_DAYS): Subscription {
  const trialEnd = new Date(new Date(nowIso).getTime() + trialDays * 86_400_000).toISOString()
  return {
    status: 'trialing',
    planSlug,
    currentPeriodStart: nowIso,
    currentPeriodEnd: trialEnd,
    trialEndsAt: trialEnd,
    cancelAtPeriodEnd: false,
    pastDueSince: null,
  }
}

export function startPaid(nowIso: string, planSlug: string, interval: BillingInterval = 'month'): Subscription {
  return {
    status: 'active',
    planSlug,
    currentPeriodStart: nowIso,
    currentPeriodEnd: addInterval(nowIso, interval),
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    pastDueSince: null,
  }
}

// ── Access ──────────────────────────────────────────────────────────────────

export interface AccessDecision {
  /** May the tenant use the product at all? */
  allowed: boolean
  /** May they create/modify, or only read and export? */
  readOnly: boolean
  reason?: 'trial_expired' | 'past_due_grace_elapsed' | 'expired' | 'cancelled_period_ended'
}

/**
 * What a subscription in this state is allowed to do.
 *
 * `past_due` is deliberately READ-ONLY rather than a lockout, and only after
 * the grace window: a customer who cannot export their own data because of a
 * failed card turns a billing problem into a trust problem, and support ends
 * up reversing it manually anyway. A cancelled subscription keeps full access
 * until the period they already paid for actually ends.
 */
export function accessFor(sub: Subscription, nowIso: string): AccessDecision {
  const now = new Date(nowIso).getTime()
  const periodEnd = new Date(sub.currentPeriodEnd).getTime()

  switch (sub.status) {
    case 'active':
      return { allowed: true, readOnly: false }

    case 'trialing':
      return now < periodEnd
        ? { allowed: true, readOnly: false }
        : { allowed: true, readOnly: true, reason: 'trial_expired' }

    case 'past_due': {
      const since = sub.pastDueSince ? new Date(sub.pastDueSince).getTime() : now
      const graceEnds = since + DUNNING_GRACE_DAYS * 86_400_000
      return now < graceEnds
        ? { allowed: true, readOnly: false }
        : { allowed: true, readOnly: true, reason: 'past_due_grace_elapsed' }
    }

    case 'cancelled':
      return now < periodEnd
        ? { allowed: true, readOnly: false }
        : { allowed: true, readOnly: true, reason: 'cancelled_period_ended' }

    case 'expired':
      return { allowed: true, readOnly: true, reason: 'expired' }
  }
}

// ── Transitions ─────────────────────────────────────────────────────────────

const ALLOWED: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trialing: ['active', 'cancelled', 'expired'],
  active: ['past_due', 'cancelled', 'expired'],
  past_due: ['active', 'cancelled', 'expired'],
  cancelled: ['active', 'expired'],   // reactivation before the period ends
  expired: ['active'],                // win-back
}

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false
}

/** Renew a paid period after a successful charge. */
export function renew(sub: Subscription, interval: BillingInterval = 'month'): Subscription {
  return {
    ...sub,
    status: 'active',
    currentPeriodStart: sub.currentPeriodEnd,
    currentPeriodEnd: addInterval(sub.currentPeriodEnd, interval),
    pastDueSince: null,
  }
}

// ── Proration ───────────────────────────────────────────────────────────────

export interface ProrationResult {
  /** Positive = charge now (upgrade). Negative = credit (downgrade). */
  amount: number
  unusedFraction: number
  daysRemaining: number
  daysInPeriod: number
}

/**
 * Proration for a mid-period plan change, by elapsed time in the period.
 *
 * A downgrade yields a NEGATIVE amount — a credit, not a refund. Refunding
 * cash on a downgrade is how customers cycle plans to extract money; a credit
 * against the next invoice is the standard and is what the invoice model here
 * already supports.
 */
export function prorate(
  sub: Subscription,
  oldMonthlyPrice: number,
  newMonthlyPrice: number,
  nowIso: string,
): ProrationResult {
  const start = new Date(sub.currentPeriodStart).getTime()
  const end = new Date(sub.currentPeriodEnd).getTime()
  const now = new Date(nowIso).getTime()

  const periodMs = Math.max(end - start, 1)
  const remainingMs = Math.min(Math.max(end - now, 0), periodMs)
  const unusedFraction = remainingMs / periodMs

  const delta = (newMonthlyPrice - oldMonthlyPrice) * unusedFraction
  return {
    amount: Math.round(delta * 100) / 100,
    unusedFraction: Math.round(unusedFraction * 10000) / 10000,
    daysRemaining: Math.ceil(remainingMs / 86_400_000),
    daysInPeriod: Math.ceil(periodMs / 86_400_000),
  }
}

/** Does this subscription owe a charge at `nowIso`? */
export function isDue(sub: Subscription, nowIso: string): boolean {
  if (sub.status === 'expired') return false
  if (sub.cancelAtPeriodEnd) return false
  return new Date(nowIso).getTime() >= new Date(sub.currentPeriodEnd).getTime()
}
