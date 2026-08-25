import { describe, it, expect } from 'vitest'
import {
  monthBounds,
  licenseTierLabel,
  buildLicenseTable,
  splitCounts,
  buildOperationsSummary,
} from '@/lib/operations-metrics'

describe('monthBounds', () => {
  it('returns UTC first-of-month boundaries for this and last month', () => {
    const { thisMonthStart, lastMonthStart } = monthBounds(new Date(Date.UTC(2026, 7, 24))) // Aug 24 2026
    expect(thisMonthStart).toBe('2026-08-01T00:00:00.000Z')
    expect(lastMonthStart).toBe('2026-07-01T00:00:00.000Z')
  })

  it('rolls across the year boundary correctly (January)', () => {
    const { lastMonthStart } = monthBounds(new Date(Date.UTC(2026, 0, 15)))
    expect(lastMonthStart).toBe('2025-12-01T00:00:00.000Z')
  })
})

describe('licenseTierLabel', () => {
  it('labels unset settings as the unlimited default', () => {
    expect(licenseTierLabel(null)).toBe('Unlimited (default)')
    expect(licenseTierLabel({})).toBe('Unlimited (default)')
    expect(licenseTierLabel({ other: true })).toBe('Unlimited (default)')
  })

  it('describes finite limits from the license blob', () => {
    expect(licenseTierLabel({ license: { customers: 100, users: 10 } })).toBe('customers: 100 · users: 10')
  })

  it('shows unlimited per key when a blob sets only some keys', () => {
    const label = licenseTierLabel({ license: { customers: -1, users: 50 } })
    expect(label).toBe('customers: unlimited · users: 50')
  })
})

describe('buildLicenseTable', () => {
  it('joins tenant names, tiers and customer counts, sorted by name', () => {
    const rows = buildLicenseTable(
      [
        { id: 't2', name: 'Zeta VAR', settings: { license: { customers: 1000, users: 50 } } },
        { id: 't1', name: 'Alpha VAR' },
      ],
      { t1: 12, t2: 340 },
    )
    expect(rows).toEqual([
      { tenantId: 't1', tenantName: 'Alpha VAR', tier: 'Unlimited (default)', customers: 12 },
      { tenantId: 't2', tenantName: 'Zeta VAR', tier: 'customers: 1000 · users: 50', customers: 340 },
    ])
  })

  it('treats missing counts as zero rather than NaN', () => {
    const rows = buildLicenseTable([{ id: 't9', name: 'Solo VAR' }], {})
    expect(rows[0].customers).toBe(0)
  })
})

describe('splitCounts + buildOperationsSummary', () => {
  it('derives inactive from total minus active without going negative', () => {
    expect(splitCounts(90, 100)).toEqual({ total: 90, active: 100, inactive: 0 })
    expect(splitCounts(100, 75)).toEqual({ total: 100, active: 75, inactive: 25 })
  })

  it('computes month-over-month order delta as a rounded percent', () => {
    const s = buildOperationsSummary({
      ordersThisMonth: 130, ordersLastMonth: 100, customersTotal: 500, activeVars: 3,
      notifications: [], users: splitCounts(40, 35), customersSplit: splitCounts(500, 480), licenses: [],
    })
    expect(s.ordersDeltaPct).toBe(30)
  })

  it('returns a null delta when last month had no orders (no fake percentage)', () => {
    const s = buildOperationsSummary({
      ordersThisMonth: 7, ordersLastMonth: 0, customersTotal: 0, activeVars: 0,
      notifications: [], users: splitCounts(0, 0), customersSplit: splitCounts(0, 0), licenses: [],
    })
    expect(s.ordersDeltaPct).toBeNull()
  })
})
