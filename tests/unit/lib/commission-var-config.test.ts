import { describe, expect, it } from 'vitest'
import { varCommissionConfig, DEFAULT_COMMISSION_CONFIG } from '@/lib/commission'

const platform = { commission: {
  platformCommissionPct: 0.08, productMarginPct: 0.02, holdbackPct: 0.01,
  corpMargin: { type: 'fixed', value: 99 }, repMargin: { type: 'fixed', value: 99 },
} }

describe('varCommissionConfig', () => {
  it("bills a VAR with no override at the admin's platform rates, not the 5% default", () => {
    const c = varCommissionConfig({}, platform)
    expect(c.platformCommissionPct).toBe(0.08)
    expect(c.productMarginPct).toBe(0.02)
    expect(c.holdbackPct).toBe(0.01)
  })

  it("never inherits the platform tenant's own corp/rep margins", () => {
    const c = varCommissionConfig({}, platform)
    expect(c.corpMargin).toEqual(DEFAULT_COMMISSION_CONFIG.corpMargin)
    expect(c.repMargin).toEqual(DEFAULT_COMMISSION_CONFIG.repMargin)
  })

  it('keeps the VAR’s own margins and any explicit per-VAR override', () => {
    const c = varCommissionConfig({ commission: {
      platformCommissionPct: 0.03,
      corpMargin: { type: 'percent', value: 0.1 }, repMargin: { type: 'fixed', value: 15 },
    } }, platform)
    expect(c.platformCommissionPct).toBe(0.03)
    expect(c.productMarginPct).toBe(0.02)
    expect(c.corpMargin).toEqual({ type: 'percent', value: 0.1 })
    expect(c.repMargin).toEqual({ type: 'fixed', value: 15 })
  })

  it('falls back to defaults when the platform has no config either', () => {
    expect(varCommissionConfig({}, {})).toEqual(DEFAULT_COMMISSION_CONFIG)
  })
})
