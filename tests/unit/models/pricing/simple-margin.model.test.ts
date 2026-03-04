import { describe, expect, it } from 'vitest'
import { SimpleMarginPricingModel } from '@/models/pricing'

describe('SimpleMarginPricingModel', () => {
  const model = new SimpleMarginPricingModel()

  it('returns error when base_price is missing or zero', () => {
    const r = model.calculate({
      device_id: 'dev-1',
      condition: 'good',
      base_price: 0,
    })
    expect(r.success).toBe(false)
    expect(r.error).toContain('base_price')
  })

  it('calculates trade-in price with condition multiplier', () => {
    const r = model.calculate({
      device_id: 'dev-1',
      condition: 'good',
      base_price: 500,
      purpose: 'buy',
      quantity: 1,
    })
    expect(r.success).toBe(true)
    expect(r.trade_price).toBeGreaterThan(0)
    expect(r.breakdown?.condition_multiplier).toBe(0.82)
  })

  it('applies ICLOUD_LOCKED deduction (90%)', () => {
    const r = model.calculate({
      device_id: 'dev-1',
      condition: 'good',
      base_price: 500,
      issues: ['ICLOUD_LOCKED'],
      purpose: 'buy',
    })
    expect(r.success).toBe(true)
    expect(r.trade_price).toBeLessThan(100)
    expect(r.breakdown?.issues_applied).toContain('ICLOUD_LOCKED')
  })

  it('calculates CPO sell price with markup', () => {
    const r = model.calculate({
      device_id: 'dev-1',
      condition: 'excellent',
      base_price: 600,
      purpose: 'sell',
      quantity: 2,
    })
    expect(r.success).toBe(true)
    expect(r.cpo_price).toBeGreaterThan(600 * 2)
    expect(r.breakdown?.purpose).toBe('sell')
  })

  it('respects quantity for trade-in', () => {
    const r1 = model.calculate({
      device_id: 'dev-1',
      condition: 'good',
      base_price: 400,
      purpose: 'buy',
      quantity: 1,
    })
    const r3 = model.calculate({
      device_id: 'dev-1',
      condition: 'good',
      base_price: 400,
      purpose: 'buy',
      quantity: 3,
    })
    expect(r3.trade_price).toBeCloseTo((r1.trade_price ?? 0) * 3, 0)
  })
})
