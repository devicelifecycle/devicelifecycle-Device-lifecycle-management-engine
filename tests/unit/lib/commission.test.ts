import { describe, it, expect } from 'vitest'
import {
  computeDealPricing,
  commissionConfigFromSettings,
  DEFAULT_COMMISSION_CONFIG,
  type CommissionConfig,
} from '@/lib/commission'

const noBB: CommissionConfig = {
  platformCommissionPct: 0,
  productMarginPct: 0,
  corpMargin: { type: 'fixed', value: 0 },
  repMargin: { type: 'fixed', value: 0 },
}

describe('commission engine — outline worked examples', () => {
  it('Trade-in: VAR price $110 → deduct corp $5 + rep $3 → customer receives $102', () => {
    const r = computeDealPricing({
      orderType: 'trade_in',
      marketValue: 110,
      config: { ...noBB, corpMargin: { type: 'fixed', value: 5 }, repMargin: { type: 'fixed', value: 3 } },
    })
    expect(r.varPrice).toBe(110)
    expect(r.corpMargin).toBe(5)
    expect(r.repMargin).toBe(3)
    expect(r.customerAmount).toBe(102)
  })

  it('CPO: VAR price $1,020 → add corp $50 + rep $30 → customer charged $1,100', () => {
    const r = computeDealPricing({
      orderType: 'cpo',
      marketValue: 1020,
      config: { ...noBB, corpMargin: { type: 'fixed', value: 50 }, repMargin: { type: 'fixed', value: 30 } },
    })
    expect(r.varPrice).toBe(1020)
    expect(r.customerAmount).toBe(1100)
    expect(r.varMargin).toBe(80)
  })
})

describe('commission engine — BB blended take', () => {
  it('CPO adds BB commission onto the base (2% of $1,000 → VAR pays $1,020)', () => {
    const r = computeDealPricing({
      orderType: 'cpo',
      marketValue: 1000,
      config: { platformCommissionPct: 0.02, productMarginPct: 0, corpMargin: { type: 'fixed', value: 50 }, repMargin: { type: 'fixed', value: 30 } },
    })
    expect(r.bbPlatformCommission).toBe(20)
    expect(r.varPrice).toBe(1020)
    expect(r.customerAmount).toBe(1100)
  })

  it('Trade-in keeps BB take out of the market value (VAR price is lower)', () => {
    const r = computeDealPricing({
      orderType: 'trade_in',
      marketValue: 200,
      config: { platformCommissionPct: 0.05, productMarginPct: 0.05, corpMargin: { type: 'fixed', value: 0 }, repMargin: { type: 'fixed', value: 0 } },
    })
    expect(r.bbTake).toBe(20) // 10% of 200
    expect(r.varPrice).toBe(180)
    expect(r.customerAmount).toBe(180)
  })

  it('supports percentage-based corp/rep margins', () => {
    const r = computeDealPricing({
      orderType: 'cpo',
      marketValue: 1000,
      config: { platformCommissionPct: 0, productMarginPct: 0, corpMargin: { type: 'percent', value: 0.05 }, repMargin: { type: 'percent', value: 0.03 } },
    })
    expect(r.corpMargin).toBe(50) // 5% of 1000
    expect(r.repMargin).toBe(30) // 3% of 1000
    expect(r.customerAmount).toBe(1080)
  })

  it('never produces negative margins', () => {
    const r = computeDealPricing({
      orderType: 'cpo',
      marketValue: 100,
      config: { ...noBB, corpMargin: { type: 'fixed', value: -50 }, repMargin: { type: 'fixed', value: 0 } },
    })
    expect(r.corpMargin).toBe(0)
  })
})

describe('commissionConfigFromSettings', () => {
  it('falls back to defaults for empty/partial settings', () => {
    expect(commissionConfigFromSettings(null)).toEqual(DEFAULT_COMMISSION_CONFIG)
    expect(commissionConfigFromSettings({}).platformCommissionPct).toBe(DEFAULT_COMMISSION_CONFIG.platformCommissionPct)
  })

  it('reads a configured commission block from tenant settings', () => {
    const cfg = commissionConfigFromSettings({
      commission: {
        platformCommissionPct: 0.08,
        productMarginPct: 0.02,
        corpMargin: { type: 'percent', value: 0.05 },
        repMargin: { type: 'fixed', value: 25 },
      },
    })
    expect(cfg.platformCommissionPct).toBe(0.08)
    expect(cfg.productMarginPct).toBe(0.02)
    expect(cfg.corpMargin).toEqual({ type: 'percent', value: 0.05 })
    expect(cfg.repMargin).toEqual({ type: 'fixed', value: 25 })
  })
})
