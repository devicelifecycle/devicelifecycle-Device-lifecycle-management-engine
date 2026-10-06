import { describe, it, expect } from 'vitest'
import {
  addInterval, startTrial, startPaid, accessFor, canTransition, renew, prorate, isDue,
  DUNNING_GRACE_DAYS, DEFAULT_TRIAL_DAYS, type Subscription,
} from '@/lib/subscription'

const T = (iso: string) => iso

describe('addInterval — day clamping', () => {
  it('keeps the billing day stable across short months', () => {
    // Naive +1 month turns Jan 31 into Mar 3, skipping February and billing
    // early forever after.
    expect(addInterval(T('2026-01-31T00:00:00.000Z'), 'month')).toBe('2026-02-28T00:00:00.000Z')
    expect(addInterval(T('2026-03-31T00:00:00.000Z'), 'month')).toBe('2026-04-30T00:00:00.000Z')
    expect(addInterval(T('2026-01-15T12:30:00.000Z'), 'month')).toBe('2026-02-15T12:30:00.000Z')
  })

  it('handles leap years in both directions', () => {
    expect(addInterval(T('2028-01-31T00:00:00.000Z'), 'month')).toBe('2028-02-29T00:00:00.000Z')
    expect(addInterval(T('2028-02-29T00:00:00.000Z'), 'year')).toBe('2029-02-28T00:00:00.000Z')
  })

  it('rolls the year over', () => {
    expect(addInterval(T('2026-12-15T00:00:00.000Z'), 'month')).toBe('2027-01-15T00:00:00.000Z')
    expect(addInterval(T('2026-06-01T00:00:00.000Z'), 'year')).toBe('2027-06-01T00:00:00.000Z')
  })

  it('rejects an invalid date instead of producing one', () => {
    expect(() => addInterval('not-a-date', 'month')).toThrow()
  })
})

describe('startTrial / startPaid', () => {
  it('a trial ends exactly N days out and is trialing', () => {
    const s = startTrial('2026-10-06T00:00:00.000Z', 'growth')
    expect(s.status).toBe('trialing')
    expect(s.trialEndsAt).toBe('2026-10-20T00:00:00.000Z') // 14 days
    expect(s.currentPeriodEnd).toBe(s.trialEndsAt)
    expect(DEFAULT_TRIAL_DAYS).toBe(14)
  })

  it('a paid subscription starts active with a one-month period', () => {
    const s = startPaid('2026-10-06T00:00:00.000Z', 'starter')
    expect(s.status).toBe('active')
    expect(s.currentPeriodEnd).toBe('2026-11-06T00:00:00.000Z')
  })
})

describe('accessFor', () => {
  const base: Subscription = {
    status: 'active', planSlug: 'growth',
    currentPeriodStart: '2026-10-01T00:00:00.000Z',
    currentPeriodEnd: '2026-11-01T00:00:00.000Z',
  }

  it('active is full access', () => {
    expect(accessFor(base, '2026-10-15T00:00:00.000Z')).toEqual({ allowed: true, readOnly: false })
  })

  it('a live trial is full access; an expired trial goes read-only, not locked out', () => {
    const t = startTrial('2026-10-01T00:00:00.000Z', 'growth')
    expect(accessFor(t, '2026-10-10T00:00:00.000Z').readOnly).toBe(false)
    const after = accessFor(t, '2026-10-21T00:00:00.000Z')
    expect(after).toMatchObject({ allowed: true, readOnly: true, reason: 'trial_expired' })
  })

  it('past_due keeps working through the grace window, then goes read-only', () => {
    const pd: Subscription = { ...base, status: 'past_due', pastDueSince: '2026-10-01T00:00:00.000Z' }
    expect(accessFor(pd, '2026-10-10T00:00:00.000Z').readOnly).toBe(false)
    const elapsed = accessFor(pd, `2026-10-${String(1 + DUNNING_GRACE_DAYS + 1).padStart(2, '0')}T00:00:00.000Z`)
    expect(elapsed).toMatchObject({ readOnly: true, reason: 'past_due_grace_elapsed' })
  })

  it('NEVER fully locks a tenant out — they can always read and export', () => {
    for (const status of ['trialing', 'active', 'past_due', 'cancelled', 'expired'] as const) {
      const s: Subscription = { ...base, status, pastDueSince: '2020-01-01T00:00:00.000Z' }
      expect(accessFor(s, '2030-01-01T00:00:00.000Z').allowed, status).toBe(true)
    }
  })

  it('a cancelled subscription keeps full access until the paid period ends', () => {
    const c: Subscription = { ...base, status: 'cancelled', cancelAtPeriodEnd: true }
    expect(accessFor(c, '2026-10-20T00:00:00.000Z').readOnly).toBe(false)
    expect(accessFor(c, '2026-11-02T00:00:00.000Z')).toMatchObject({ readOnly: true, reason: 'cancelled_period_ended' })
  })
})

describe('canTransition', () => {
  it('allows the real lifecycle moves', () => {
    expect(canTransition('trialing', 'active')).toBe(true)
    expect(canTransition('active', 'past_due')).toBe(true)
    expect(canTransition('past_due', 'active')).toBe(true)
    expect(canTransition('cancelled', 'active')).toBe(true)  // reactivation
    expect(canTransition('expired', 'active')).toBe(true)    // win-back
  })
  it('refuses nonsense', () => {
    expect(canTransition('trialing', 'past_due')).toBe(false) // nothing was owed yet
    expect(canTransition('expired', 'past_due')).toBe(false)
    expect(canTransition('active', 'trialing')).toBe(false)   // no going back to a trial
  })
})

describe('renew', () => {
  it('rolls the period forward from the old end, not from now — no drift, no lost days', () => {
    const s = startPaid('2026-01-31T00:00:00.000Z', 'growth')
    const r = renew(s)
    expect(r.currentPeriodStart).toBe('2026-02-28T00:00:00.000Z')
    expect(r.currentPeriodEnd).toBe('2026-03-28T00:00:00.000Z')
    expect(r.status).toBe('active')
  })
  it('clears past_due on a successful renewal', () => {
    const s: Subscription = { ...startPaid('2026-10-01T00:00:00.000Z', 'growth'), status: 'past_due', pastDueSince: '2026-11-01T00:00:00.000Z' }
    expect(renew(s).pastDueSince).toBeNull()
    expect(renew(s).status).toBe('active')
  })
})

describe('prorate', () => {
  const sub = startPaid('2026-10-01T00:00:00.000Z', 'starter') // ends 2026-11-01

  it('charges the difference for the unused part of the period on an upgrade', () => {
    // Exactly half the period gone: half the $200 difference.
    const p = prorate(sub, 99, 299, '2026-10-16T12:00:00.000Z')
    expect(p.unusedFraction).toBeCloseTo(0.5, 2)
    expect(p.amount).toBeCloseTo(100, 0)
  })

  it('a downgrade is a CREDIT (negative), never a cash refund', () => {
    const p = prorate(sub, 299, 99, '2026-10-16T12:00:00.000Z')
    expect(p.amount).toBeLessThan(0)
    expect(p.amount).toBeCloseTo(-100, 0)
  })

  it('an upgrade on the last day costs almost nothing', () => {
    const p = prorate(sub, 99, 999, '2026-10-31T23:00:00.000Z')
    expect(p.amount).toBeLessThan(30)
    expect(p.unusedFraction).toBeLessThan(0.05)
  })

  it('never prorates outside the period', () => {
    expect(prorate(sub, 99, 299, '2026-12-01T00:00:00.000Z').amount).toBe(0)   // past the end
    expect(prorate(sub, 99, 299, '2026-09-01T00:00:00.000Z').unusedFraction).toBe(1) // before the start
  })

  it('same plan costs nothing', () => {
    expect(prorate(sub, 299, 299, '2026-10-15T00:00:00.000Z').amount).toBe(0)
  })
})

describe('isDue', () => {
  const sub = startPaid('2026-10-01T00:00:00.000Z', 'growth') // ends 2026-11-01

  it('is due at the period end, not before', () => {
    expect(isDue(sub, '2026-10-31T23:59:59.000Z')).toBe(false)
    expect(isDue(sub, '2026-11-01T00:00:00.000Z')).toBe(true)
  })
  it('never charges a subscription set to cancel, or an expired one', () => {
    expect(isDue({ ...sub, cancelAtPeriodEnd: true }, '2026-12-01T00:00:00.000Z')).toBe(false)
    expect(isDue({ ...sub, status: 'expired' }, '2026-12-01T00:00:00.000Z')).toBe(false)
  })
})
