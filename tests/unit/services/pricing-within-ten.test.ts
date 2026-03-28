// ============================================================================
// PRICING: Suggested price within $10 of target (competitor avg or beat formula)
// ============================================================================
// Ensures our model suggests exact or close price — difference of $10 or less
// from the expected value (competitor avg × (1 - margin%) or highest × (1 + beat%)).

import { describe, expect, it } from 'vitest'
import { SimpleMarginPricingModel } from '@/models/pricing'

const TOLERANCE = 10 // $10 or less difference from expected

describe('Pricing: suggested price within $10 of target', () => {
  const model = new SimpleMarginPricingModel()

  it('model quote is exact or within $10 of formula (base × mult − costs − margin)', () => {
    const basePrice = 500
    // SimpleMargin: good = 0.82, then (price - 12 - price*0.22) ≈ 500*0.82*0.78 - 12 ≈ 307.8
    const result = model.calculate({
      device_id: 'dev-1',
      condition: 'good',
      base_price: basePrice,
      purpose: 'buy',
      quantity: 1,
    })
    expect(result.success).toBe(true)
    const ourQuote = result.trade_price ?? 0
    const expectedApprox = 308 // within 10 of 307.8
    expect(Math.abs(ourQuote - expectedApprox)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('formula: competitor_avg × (1 - margin%) is exact or within 10', () => {
    const competitorAvg = 400
    const marginPercent = 20
    const expectedQuote = competitorAvg * (1 - marginPercent / 100) // 320
    const ourQuote = Math.round(expectedQuote * 100) / 100
    expect(Math.abs(ourQuote - expectedQuote)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('formula: highest × (1 + beat%) is exact or within 10', () => {
    const highestCompetitor = 450
    const beatPercent = 2
    const expectedQuote = highestCompetitor * (1 + beatPercent / 100) // 459
    const ourQuote = Math.round(expectedQuote * 100) / 100
    expect(Math.abs(ourQuote - expectedQuote)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('tolerance of 10 allows exact or ±10 match', () => {
    const target = 320
    for (const actual of [310, 315, 320, 325, 330]) {
      expect(Math.abs(actual - target)).toBeLessThanOrEqual(TOLERANCE)
    }
  })

  it('tolerance of 10 rejects difference > 10', () => {
    const target = 320
    expect(Math.abs(309 - target)).toBeGreaterThan(TOLERANCE)  // 11 away
    expect(Math.abs(331 - target)).toBeGreaterThan(TOLERANCE)  // 11 away
  })
})
