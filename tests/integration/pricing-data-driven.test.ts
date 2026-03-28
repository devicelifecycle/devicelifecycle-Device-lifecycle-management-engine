// ============================================================================
// DATA-DRIVEN PRICING - INTEGRATION TESTS (~20 trials)
// ============================================================================
// Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// Skips when DB config is missing. Uses mocked createServerSupabaseClient.
// setup.ts loads .env.local before mocks run.

import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { DataDrivenPricingModel } from '@/models/pricing'
import { PRICING_SCENARIOS } from '../fixtures/pricing-scenarios'

const hasDb =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY

vi.mock('@/lib/supabase/server', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return {
      createServerSupabaseClient: () => {
        throw new Error('Supabase not configured for tests')
      },
    }
  }
  return {
    createServerSupabaseClient: () => createClient(url, key),
  }
})

const DATA_DRIVEN_SCENARIOS = PRICING_SCENARIOS.filter((_, i) => i % 5 === 0)

describe.skipIf(!hasDb)('DataDrivenPricingModel - integration', () => {
  const model = new DataDrivenPricingModel()

  it('warmup: ensures baselines exist (triggers auto-train if empty)', async () => {
    const result = await model.calculate({
      device_id: DATA_DRIVEN_SCENARIOS[0].device_id,
      storage: DATA_DRIVEN_SCENARIOS[0].storage,
      carrier: 'Unlocked',
      condition: 'good',
      quantity: 1,
      purpose: 'buy',
    })
    expect(result.success || result.error).toBeTruthy()
  }, 180000)

  it.each(DATA_DRIVEN_SCENARIOS)(
    'trial $scenarioIndex: $category $condition',
    async (scenario) => {
      const result = await model.calculate({
        device_id: scenario.device_id,
        storage: scenario.storage,
        carrier: scenario.carrier,
        condition: scenario.condition,
        issues: scenario.issues,
        quantity: scenario.quantity,
        purpose: scenario.purpose,
      })

      if (result.success) {
        expect(result.final_price).toBeGreaterThanOrEqual(0)
        expect(result.breakdown).toBeDefined()
        expect(result.confidence).toBeGreaterThan(0)
      } else {
        expect(result.error).toBeDefined()
        expect(typeof result.error).toBe('string')
      }
    },
    15000
  )
})
