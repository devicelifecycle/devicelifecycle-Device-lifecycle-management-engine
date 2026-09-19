import { describe, it, expect } from 'vitest'
import {
  monthBounds,
  licenseTierLabel,
  buildLicenseTable,
  totalStorageBytes,
  formatBytes,
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
    // No usage maps supplied → metering cells are null ("unavailable"), never 0.
    expect(rows).toEqual([
      { tenantId: 't1', tenantName: 'Alpha VAR', tier: 'Unlimited (default)', customers: 12, storageBytes: null, apiCallsMtd: null, aiTokensMtd: null },
      { tenantId: 't2', tenantName: 'Zeta VAR', tier: 'customers: 1000 · users: 50', customers: 340, storageBytes: null, apiCallsMtd: null, aiTokensMtd: null },
    ])
  })

  it('treats missing counts as zero rather than NaN', () => {
    const rows = buildLicenseTable([{ id: 't9', name: 'Solo VAR' }], {})
    expect(rows[0].customers).toBe(0)
  })

  it('fills metering cells from the usage maps; a tenant absent from a PRESENT map is a real zero', () => {
    const rows = buildLicenseTable(
      [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }],
      {},
      {
        storage: new Map([['t1', { bytes: 42384 }]]),
        month: new Map([['t2', { api_calls: 17, ai_tokens: 1200 }]]),
      },
    )
    expect(rows[0]).toMatchObject({ tenantId: 't1', storageBytes: 42384, apiCallsMtd: 0, aiTokensMtd: 0 })
    expect(rows[1]).toMatchObject({ tenantId: 't2', storageBytes: 0, apiCallsMtd: 17, aiTokensMtd: 1200 })
  })

  it('one failed source nulls only its own cells', () => {
    const rows = buildLicenseTable([{ id: 't1', name: 'A' }], {}, { storage: null, month: new Map() })
    expect(rows[0].storageBytes).toBeNull()
    expect(rows[0].apiCallsMtd).toBe(0)
  })
})

describe('totalStorageBytes + formatBytes', () => {
  it('sums measured rows and refuses to total when any row is unavailable', () => {
    const ok = buildLicenseTable([{ id: 'a' }, { id: 'b' }], {}, { storage: new Map([['a', { bytes: 1000 }], ['b', { bytes: 24 }]]), month: null })
    expect(totalStorageBytes(ok)).toBe(1024)
    const bad = buildLicenseTable([{ id: 'a' }], {}, { storage: null, month: null })
    expect(totalStorageBytes(bad)).toBeNull()
  })

  it('formats bytes with a sensible unit', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(42384)).toBe('41.4 KB')
    expect(formatBytes(30 * 1024 * 1024)).toBe('30.0 MB')
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
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
