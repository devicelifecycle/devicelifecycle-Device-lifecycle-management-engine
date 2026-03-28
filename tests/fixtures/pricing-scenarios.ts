// ============================================================================
// PRICING TEST SCENARIOS - 100 trials across devices, conditions, issues
// ============================================================================
// Used by SimpleMargin 100-trial unit tests and optional DataDriven integration tests.
// Device IDs from supabase/seed/pricing-data.sql and migrations.

import type { DeviceCondition } from '@/types'

/** Device IDs by category (from seed/migrations) */
export const DEVICE_IDS_BY_CATEGORY = {
  phone: [
    'd0010000-0000-0000-0000-000000000002', // iPhone 15 Pro
    'd0010000-0000-0000-0000-000000000005', // iPhone 14 Pro Max
    'd0010000-0000-0000-0000-000000000010', // iPhone 13
    'd0010000-0000-0000-0000-000000000013', // iPhone 12
    'd0020000-0000-0000-0000-000000000001', // Galaxy S24 Ultra
    'd0020000-0000-0000-0000-000000000003', // Galaxy S24
    'd0030000-0000-0000-0000-000000000001', // Pixel 8 Pro
    'd0030000-0000-0000-0000-000000000004', // Pixel 7
  ],
  tablet: [
    'd0040000-0000-0000-0000-000000000001', // iPad Pro 12.9" (M2)
    'd0040000-0000-0000-0000-000000000003', // iPad Air (5th Gen)
    'd0040000-0000-0000-0000-000000000005', // iPad mini (6th Gen)
    'd0070000-0000-0000-0000-000000000001', // Galaxy Tab S9 Ultra
    'd0070000-0000-0000-0000-000000000003', // Galaxy Tab S9
    'd0080000-0000-0000-0000-000000000001', // Pixel Tablet
  ],
  laptop: [
    'd0050000-0000-0000-0000-000000000001', // MacBook Pro 16" (M3 Max)
    'd0050000-0000-0000-0000-000000000003', // MacBook Air 15" (M3)
    'd0050000-0000-0000-0000-000000000005', // MacBook Pro 14" (M3)
    'd0050000-0000-0000-0000-000000000006', // MacBook Pro 13" (M2)
  ],
  watch: [
    'd0060000-0000-0000-0000-000000000001', // Apple Watch Ultra 2
    'd0060000-0000-0000-0000-000000000002', // Apple Watch Series 9
    'd0060000-0000-0000-0000-000000000003', // Apple Watch SE (2nd Gen)
    'd0070000-0000-0000-0000-000000000005', // Galaxy Watch 7
    'd0080000-0000-0000-0000-000000000002', // Pixel Watch 2
  ],
} as const

export type DeviceCategory = keyof typeof DEVICE_IDS_BY_CATEGORY

const CONDITIONS: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']
const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB'] as const
const PURPOSES = ['buy', 'sell'] as const
const QUANTITIES = [1, 3, 10] as const

/** Issue scenarios: none, single minor, single critical, multiple */
const ISSUE_SCENARIOS: (string[] | undefined)[] = [
  undefined,
  ['SCREEN_CRACK'],
  ['BATTERY_POOR'],
  ['ICLOUD_LOCKED'],
  ['SCREEN_CRACK', 'BATTERY_POOR'],
  ['WATER_DAMAGE'],
]

/** Base price ranges by category (SimpleMargin requires base_price) */
const BASE_PRICE_BY_CATEGORY: Record<DeviceCategory, [number, number]> = {
  phone: [400, 1200],
  tablet: [300, 1500],
  laptop: [800, 3000],
  watch: [150, 600],
}

export interface PricingScenarioInput {
  device_id: string
  storage: string
  carrier: string
  condition: DeviceCondition
  issues?: string[]
  quantity: number
  purpose: 'buy' | 'sell'
  base_price: number
  category: DeviceCategory
  scenarioIndex: number
}

/**
 * Generate 100 pricing scenarios with deterministic sampling.
 * 25 per category (phone, tablet, laptop, watch).
 */
function generateScenarios(): PricingScenarioInput[] {
  const scenarios: PricingScenarioInput[] = []
  let idx = 0

  const categories: DeviceCategory[] = ['phone', 'tablet', 'laptop', 'watch']
  const devices = categories.map((cat) => ({
    category: cat,
    ids: DEVICE_IDS_BY_CATEGORY[cat],
  }))

  for (const { category, ids } of devices) {
    const [minPrice, maxPrice] = BASE_PRICE_BY_CATEGORY[category]
    const priceSpan = maxPrice - minPrice

    for (let i = 0; i < 25; i++) {
      const scenarioIdx = idx
      const deviceId = ids[i % ids.length]
      const condition = CONDITIONS[i % CONDITIONS.length]
      const storage = STORAGE_OPTIONS[i % STORAGE_OPTIONS.length]
      const purpose = PURPOSES[i % PURPOSES.length]
      const quantity = QUANTITIES[i % QUANTITIES.length]
      const issueScenario = ISSUE_SCENARIOS[i % ISSUE_SCENARIOS.length]
      const base_price = Math.round(minPrice + (priceSpan * (i / 25)))

      scenarios.push({
        device_id: deviceId,
        storage,
        carrier: 'Unlocked',
        condition,
        issues: issueScenario,
        quantity,
        purpose,
        base_price,
        category,
        scenarioIndex: scenarioIdx,
      })
      idx++
    }
  }

  return scenarios
}

export const PRICING_SCENARIOS: PricingScenarioInput[] = generateScenarios()
