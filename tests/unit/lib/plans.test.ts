import { describe, it, expect } from 'vitest'
import { normalizePlan, annualize, monthlyRecurringRevenue } from '@/lib/plans'
import { UNLIMITED } from '@/lib/licensing'

describe('subscription plans', () => {
  it('normalizes a full plan row', () => {
    const p = normalizePlan({
      id: 'p1', name: 'Growth', slug: 'growth', monthly_price: 299, currency: 'CAD',
      is_active: true, limits: { customers: 500 }, features: { sso: true },
    })
    expect(p.name).toBe('Growth')
    expect(p.monthlyPrice).toBe(299)
    expect(p.limits.customers).toBe(500)
    expect(p.limits.users).toBe(UNLIMITED)
    expect(p.features.sso).toBe(true)
    expect(p.features.billing).toBe(true) // default preserved
  })

  it('defends against partial / junk rows', () => {
    const p = normalizePlan(null)
    expect(p.name).toBe('Unnamed plan')
    expect(p.monthlyPrice).toBe(0)
    expect(p.currency).toBe('CAD')
    expect(p.isActive).toBe(true)
  })

  it('floors negative price to 0', () => {
    expect(normalizePlan({ monthly_price: -50 }).monthlyPrice).toBe(0)
  })

  it('annualizes monthly price', () => {
    expect(annualize(299)).toBe(3588)
    expect(annualize(0)).toBe(0)
  })

  it('MRR sums only active tenants', () => {
    const mrr = monthlyRecurringRevenue([
      { isActive: true, planPrice: 299 },
      { isActive: true, planPrice: 99 },
      { isActive: false, planPrice: 999 }, // excluded
    ])
    expect(mrr).toBe(398)
  })
})
