import { describe, it, expect } from 'vitest'
import {
  activeSplit,
  computeMrr,
  sumInvoiceTotals,
  buildPlatformSummary,
} from '@/lib/platform-metrics'

describe('platform metrics', () => {
  it('activeSplit counts active/inactive (null = active)', () => {
    expect(activeSplit([{ is_active: true }, { is_active: false }, { is_active: null }])).toEqual({
      total: 3, active: 2, inactive: 1,
    })
  })

  it('MRR sums active tenants with a priced plan', () => {
    const prices = { starter: 99, growth: 299, enterprise: 999 }
    const mrr = computeMrr(
      [
        { is_active: true, plan: 'growth' },
        { is_active: true, plan: 'starter' },
        { is_active: false, plan: 'enterprise' }, // inactive → excluded
        { is_active: true, plan: null },           // no plan → 0
        { is_active: true, plan: 'unknown' },      // unknown slug → 0
      ],
      prices,
    )
    expect(mrr).toBe(398)
  })

  it('sumInvoiceTotals filters by status', () => {
    const invoices = [
      { status: 'paid', total: 100 },
      { status: 'paid', total: 50 },
      { status: 'sent', total: 30 },
      { status: 'void', total: 999 },
    ]
    expect(sumInvoiceTotals(invoices, ['paid'])).toBe(150)
    expect(sumInvoiceTotals(invoices, ['sent'])).toBe(30)
    expect(sumInvoiceTotals(invoices, ['paid', 'sent'])).toBe(180)
  })

  it('buildPlatformSummary assembles the dashboard numbers', () => {
    const s = buildPlatformSummary({
      tenants: [
        { is_active: true, plan: 'growth', type: 'var' },
        { is_active: true, plan: 'starter', type: 'var' },
        { is_active: true, plan: null, type: 'platform' },
      ],
      planPriceBySlug: { starter: 99, growth: 299 },
      invoices: [{ status: 'paid', total: 500 }, { status: 'sent', total: 200 }],
      customers: { total: 2, active: 1, inactive: 1 },
      orderCount: 42,
      deviceCount: 608,
    })
    expect(s.mrr).toBe(398)
    expect(s.arr).toBe(4776)
    expect(s.revenuePaid).toBe(500)
    expect(s.revenueOutstanding).toBe(200)
    expect(s.tenants.vars).toBe(2)
    expect(s.customers.active).toBe(1)
    expect(s.orders).toBe(42)
    expect(s.devices).toBe(608)
  })
})
