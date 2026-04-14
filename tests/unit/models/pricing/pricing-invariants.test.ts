// ============================================================================
// PRICING MODEL INVARIANTS — Mathematical correctness tests
// ============================================================================
// These tests verify that SimpleMarginPricingModel upholds hard mathematical
// guarantees regardless of device or price level:
//   1. Condition ordering  : new ≥ excellent ≥ good ≥ fair ≥ poor
//   2. Purpose spread      : sell price > buy price for same condition
//   3. Quantity linearity  : price(qty=N) === price(qty=1) × N
//   4. Issue monotonicity  : adding an issue never increases price
//   5. Non-negativity      : final price is always ≥ 0
//   6. Stacking issues     : each additional issue further reduces price

import { describe, expect, it } from 'vitest'
import { SimpleMarginPricingModel } from '@/models/pricing'
import type { DeviceCondition } from '@/types'

const model = new SimpleMarginPricingModel()

// Representative devices spanning price tiers
const SAMPLE_DEVICES = [
  { id: 'inv-budget',    base_price: 200,  label: 'budget phone ($200)' },
  { id: 'inv-mid',       base_price: 600,  label: 'mid-range phone ($600)' },
  { id: 'inv-flagship',  base_price: 1200, label: 'flagship phone ($1200)' },
  { id: 'inv-laptop',    base_price: 2000, label: 'premium laptop ($2000)' },
  { id: 'inv-ultra',     base_price: 3500, label: 'workstation ($3500)' },
]

const ALL_CONDITIONS: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']
const KNOWN_ISSUES = ['SCREEN_CRACK', 'BATTERY_POOR', 'CARRIER_LOCKED', 'WATER_DAMAGE']

// ── 1. Condition ordering ────────────────────────────────────────────────────
describe('Invariant: condition price ordering (new ≥ excellent ≥ good ≥ fair ≥ poor)', () => {
  for (const device of SAMPLE_DEVICES) {
    describe(device.label, () => {
      for (const purpose of ['buy', 'sell'] as const) {
        it(`${purpose}: prices decrease monotonically with condition`, () => {
          const prices = ALL_CONDITIONS.map((cond) => {
            const r = model.calculate({
              device_id: device.id,
              condition: cond,
              purpose,
              base_price: device.base_price,
              quantity: 1,
            })
            expect(r.success).toBe(true)
            return r.final_price
          })

          // new ≥ excellent ≥ good ≥ fair ≥ poor
          for (let i = 0; i < prices.length - 1; i++) {
            expect(prices[i]).toBeGreaterThanOrEqual(prices[i + 1])
          }
        })
      }
    })
  }
})

// ── 2. Sell price > buy price ────────────────────────────────────────────────
describe('Invariant: sell (CPO) price > buy (trade-in) price for same condition', () => {
  for (const device of SAMPLE_DEVICES) {
    for (const condition of ALL_CONDITIONS) {
      it(`${device.label} | ${condition}`, () => {
        const buy = model.calculate({
          device_id: device.id,
          condition,
          purpose: 'buy',
          base_price: device.base_price,
          quantity: 1,
        })
        const sell = model.calculate({
          device_id: device.id,
          condition,
          purpose: 'sell',
          base_price: device.base_price,
          quantity: 1,
        })

        expect(buy.success).toBe(true)
        expect(sell.success).toBe(true)
        // CPO must always be above trade-in for a healthy margin
        expect(sell.final_price).toBeGreaterThan(buy.final_price)
      })
    }
  }
})

// ── 3. Quantity linearity ────────────────────────────────────────────────────
describe('Invariant: price scales linearly with quantity', () => {
  const device = SAMPLE_DEVICES[1] // mid-range

  for (const condition of ['new', 'good', 'poor'] as DeviceCondition[]) {
    for (const purpose of ['buy', 'sell'] as const) {
      for (const qty of [2, 5, 10, 50]) {
        it(`qty=${qty} | ${condition} | ${purpose}`, () => {
          const single = model.calculate({
            device_id: device.id,
            condition,
            purpose,
            base_price: device.base_price,
            quantity: 1,
          })
          const bulk = model.calculate({
            device_id: device.id,
            condition,
            purpose,
            base_price: device.base_price,
            quantity: qty,
          })

          expect(single.success).toBe(true)
          expect(bulk.success).toBe(true)
          // Allow ±1 cent for floating point rounding
          expect(bulk.final_price).toBeCloseTo(single.final_price * qty, 1)
        })
      }
    }
  }
})

// ── 4. Issue monotonicity ────────────────────────────────────────────────────
describe('Invariant: adding an issue never increases price', () => {
  const device = SAMPLE_DEVICES[2] // flagship

  for (const issue of KNOWN_ISSUES) {
    for (const condition of ['excellent', 'good', 'fair'] as DeviceCondition[]) {
      it(`${issue} | ${condition}`, () => {
        const without = model.calculate({
          device_id: device.id,
          condition,
          purpose: 'buy',
          base_price: device.base_price,
          quantity: 1,
          issues: [],
        })
        const with_issue = model.calculate({
          device_id: device.id,
          condition,
          purpose: 'buy',
          base_price: device.base_price,
          quantity: 1,
          issues: [issue],
        })

        expect(without.success).toBe(true)
        expect(with_issue.success).toBe(true)
        expect(with_issue.final_price).toBeLessThanOrEqual(without.final_price)
      })
    }
  }
})

// ── 5. Non-negativity ────────────────────────────────────────────────────────
describe('Invariant: final_price is always ≥ 0 (no negative prices)', () => {
  for (const device of SAMPLE_DEVICES) {
    describe(device.label, () => {
      for (const condition of ALL_CONDITIONS) {
        for (const purpose of ['buy', 'sell'] as const) {
          // Worst case: all known issues stacked
          it(`${condition} | ${purpose} | all issues stacked`, () => {
            const r = model.calculate({
              device_id: device.id,
              condition,
              purpose,
              base_price: device.base_price,
              quantity: 1,
              issues: KNOWN_ISSUES,
            })

            expect(r.success).toBe(true)
            expect(r.final_price).toBeGreaterThanOrEqual(0)
          })
        }
      }
    })
  }

  it('extreme case: budget device ($100), poor condition, ICLOUD_LOCKED → non-negative', () => {
    const r = model.calculate({
      device_id: 'inv-extreme',
      condition: 'poor',
      purpose: 'buy',
      base_price: 100,
      quantity: 1,
      issues: ['ICLOUD_LOCKED', 'SCREEN_DEAD'],
    })
    expect(r.success).toBe(true)
    expect(r.final_price).toBeGreaterThanOrEqual(0)
  })
})

// ── 6. Issue stacking ─────────────────────────────────────────────────────────
describe('Invariant: each additional issue reduces price further (or keeps it at 0)', () => {
  const device = SAMPLE_DEVICES[2] // flagship, $1200

  it('single → double → triple issues: monotonically decreasing buy price', () => {
    const noIssue = model.calculate({
      device_id: device.id, condition: 'good', purpose: 'buy',
      base_price: device.base_price, quantity: 1, issues: [],
    })
    const oneIssue = model.calculate({
      device_id: device.id, condition: 'good', purpose: 'buy',
      base_price: device.base_price, quantity: 1, issues: ['SCREEN_CRACK'],
    })
    const twoIssues = model.calculate({
      device_id: device.id, condition: 'good', purpose: 'buy',
      base_price: device.base_price, quantity: 1, issues: ['SCREEN_CRACK', 'BATTERY_POOR'],
    })
    const threeIssues = model.calculate({
      device_id: device.id, condition: 'good', purpose: 'buy',
      base_price: device.base_price, quantity: 1, issues: ['SCREEN_CRACK', 'BATTERY_POOR', 'WATER_DAMAGE'],
    })

    expect(noIssue.final_price).toBeGreaterThanOrEqual(oneIssue.final_price)
    expect(oneIssue.final_price).toBeGreaterThanOrEqual(twoIssues.final_price)
    expect(twoIssues.final_price).toBeGreaterThanOrEqual(threeIssues.final_price)
  })

  it('ICLOUD_LOCKED alone is the single largest deduction', () => {
    const withIcloud = model.calculate({
      device_id: device.id, condition: 'good', purpose: 'buy',
      base_price: device.base_price, quantity: 1, issues: ['ICLOUD_LOCKED'],
    })
    const withScreenCrack = model.calculate({
      device_id: device.id, condition: 'good', purpose: 'buy',
      base_price: device.base_price, quantity: 1, issues: ['SCREEN_CRACK'],
    })

    // iCloud locked (90% deduction) is worse than screen crack (15% deduction)
    expect(withIcloud.final_price).toBeLessThan(withScreenCrack.final_price)
  })
})

// ── 7. Base price validation ──────────────────────────────────────────────────
describe('Invariant: model rejects invalid base_price', () => {
  it('base_price = 0 returns success=false', () => {
    const r = model.calculate({
      device_id: 'bad', condition: 'good', purpose: 'buy',
      base_price: 0, quantity: 1,
    })
    expect(r.success).toBe(false)
    expect(r.error).toBeDefined()
  })

  it('base_price negative returns success=false', () => {
    const r = model.calculate({
      device_id: 'bad', condition: 'good', purpose: 'buy',
      base_price: -100, quantity: 1,
    })
    expect(r.success).toBe(false)
  })

  it('base_price omitted returns success=false', () => {
    const r = model.calculate({
      device_id: 'bad', condition: 'good', purpose: 'buy',
    })
    expect(r.success).toBe(false)
  })
})

// ── 8. Breakdown completeness ─────────────────────────────────────────────────
describe('Invariant: breakdown always contains required fields', () => {
  const device = SAMPLE_DEVICES[0]

  for (const condition of ['new', 'good', 'poor'] as DeviceCondition[]) {
    for (const purpose of ['buy', 'sell'] as const) {
      it(`${condition} | ${purpose}`, () => {
        const r = model.calculate({
          device_id: device.id,
          condition,
          purpose,
          base_price: device.base_price,
          quantity: 1,
        })

        expect(r.breakdown).toBeDefined()
        const b = r.breakdown as Record<string, unknown>
        expect(b).toHaveProperty('base_price')
        expect(b).toHaveProperty('condition')
        expect(b).toHaveProperty('condition_multiplier')
        expect(b).toHaveProperty('after_condition')
        expect(b).toHaveProperty('purpose')
        expect(b).toHaveProperty('final_price')
        expect(b).toHaveProperty('quantity')

        // Values should be internally consistent
        expect(b.condition).toBe(condition)
        expect(b.purpose).toBe(purpose)
        expect(b.base_price).toBe(device.base_price)
        expect(b.quantity).toBe(1)
      })
    }
  }
})

// ── 9. Confidence and validity fields ─────────────────────────────────────────
describe('Invariant: result always includes confidence and valid_for_hours', () => {
  it('successful result has confidence in [0, 1] and positive valid_for_hours', () => {
    const r = model.calculate({
      device_id: 'conf-test', condition: 'good', purpose: 'buy',
      base_price: 500, quantity: 1,
    })
    expect(r.success).toBe(true)
    expect(r.confidence).toBeGreaterThanOrEqual(0)
    expect(r.confidence).toBeLessThanOrEqual(1)
    expect(r.valid_for_hours).toBeGreaterThan(0)
    expect(r.price_date).toMatch(/^\d{4}-\d{2}-\d{2}T/) // ISO 8601
  })
})
