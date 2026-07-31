import { describe, it, expect } from 'vitest'
import {
  residualRetention,
  estimateResidualValue,
  computeRve,
  DEFAULT_DEPRECIATION,
  type DepreciationPoint,
} from '@/lib/rve'
import { DEFAULT_COMMISSION_CONFIG } from '@/lib/commission'

describe('RVE depreciation', () => {
  it('returns full value at month 0', () => {
    expect(residualRetention(0)).toBe(1)
    expect(estimateResidualValue(1000, 0)).toBe(1000)
  })

  it('interpolates linearly between table points', () => {
    // 0.82 @ 6mo, 0.68 @ 12mo → 9mo midpoint = 0.75
    expect(residualRetention(9)).toBeCloseTo(0.75, 5)
    expect(estimateResidualValue(1000, 9)).toBe(750)
  })

  it('hits table points exactly', () => {
    expect(residualRetention(12)).toBe(0.68)
    expect(residualRetention(24)).toBe(0.46)
  })

  it('clamps beyond the last point', () => {
    expect(residualRetention(999)).toBe(0.12) // floors at last point
  })

  it('clamps negative months to base value', () => {
    expect(residualRetention(-5)).toBe(1)
    expect(estimateResidualValue(500, -5)).toBe(500)
  })

  it('accepts a custom (unsorted) depreciation table', () => {
    const table: DepreciationPoint[] = [
      { months: 12, retention: 0.5 },
      { months: 0, retention: 1 },
    ]
    expect(residualRetention(6, table)).toBeCloseTo(0.75, 5)
  })

  it('DEFAULT table is monotonic non-increasing', () => {
    for (let i = 1; i < DEFAULT_DEPRECIATION.length; i++) {
      expect(DEFAULT_DEPRECIATION[i].retention).toBeLessThanOrEqual(DEFAULT_DEPRECIATION[i - 1].retention)
    }
  })
})

describe('computeRve — residual value priced as a trade-in', () => {
  it('depreciates then applies trade-in pricing', () => {
    const config = { ...DEFAULT_COMMISSION_CONFIG, platformCommissionPct: 0.05 }
    const r = computeRve({ baseValue: 1000, months: 12, config })
    expect(r.residualValue).toBe(680) // 1000 * 0.68
    expect(r.pricing.orderType).toBe('trade_in')
    expect(r.pricing.bbPlatformCommission).toBe(34) // 5% of 680
    expect(r.pricing.varPrice).toBe(646) // 680 - 34
  })
})
