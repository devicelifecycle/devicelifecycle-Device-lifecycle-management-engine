// ============================================================================
// SIMPLE MARGIN - 100 TRIAL PRICING TESTS
// ============================================================================
// Runs 100 scenarios across phones, tablets, laptops, watches;
// all conditions, issue combinations, purposes, and quantities.

import { describe, expect, it } from 'vitest'
import { SimpleMarginPricingModel } from '@/models/pricing'
import { PRICING_SCENARIOS } from '../../../fixtures/pricing-scenarios'

const model = new SimpleMarginPricingModel()

describe('SimpleMarginPricingModel - 100 trials', () => {
  it.each(PRICING_SCENARIOS)(
    'trial $scenarioIndex: $category $condition qty$quantity $purpose',
    (scenario) => {
      const result = model.calculate({
        device_id: scenario.device_id,
        storage: scenario.storage,
        carrier: scenario.carrier,
        condition: scenario.condition,
        issues: scenario.issues,
        quantity: scenario.quantity,
        purpose: scenario.purpose,
        base_price: scenario.base_price,
      })

      expect(result.success).toBe(true)
      expect(result.final_price).toBeGreaterThanOrEqual(0)
      expect(result.breakdown).toBeDefined()
      expect(result.breakdown?.condition).toBe(scenario.condition)
      expect(result.breakdown?.quantity).toBe(scenario.quantity)
      expect(result.breakdown?.purpose).toBe(scenario.purpose)

      if (scenario.purpose === 'buy') {
        expect(result.trade_price).toBeDefined()
        expect(result.trade_price).toBe(result.final_price)
      } else {
        expect(result.cpo_price).toBeDefined()
        expect(result.cpo_price).toBe(result.final_price)
      }

      if (scenario.issues && scenario.issues.length > 0) {
        expect(result.breakdown?.issues_applied).toBeDefined()
        expect((result.breakdown?.issues_applied as string[]).length).toBeGreaterThan(0)
      }

      expect(result.breakdown?.condition_multiplier).toBeGreaterThan(0)
      expect(result.breakdown?.condition_multiplier).toBeLessThanOrEqual(1)
    }
  )
})
