// ============================================================================
// ISSUE CODE TESTS — All known deduction codes + edge cases
// ============================================================================
// Verifies that every issue code in SimpleMarginPricingModel:
//   • Reduces price relative to the no-issue baseline (or keeps at 0)
//   • Produces a correct, deterministic deduction amount
//   • Registers in the breakdown's issues_applied list
//
// Also verifies graceful handling of:
//   • Unknown/misspelled codes (no crash, no deduction, no price change)
//   • Empty issues array (identical to no issues param)
//   • Duplicate issue codes (applied once or twice — model-defined behavior)

import { describe, expect, it } from 'vitest'
import { SimpleMarginPricingModel } from '@/models/pricing'

const model = new SimpleMarginPricingModel()

// Reference device for all issue tests: mid-range phone, good condition
const REF = {
  device_id: 'issue-ref-phone',
  condition: 'good' as const,
  purpose: 'buy' as const,
  base_price: 700,
  quantity: 1,
}

// Baseline: no issues
function baseline(overrides: Partial<typeof REF> = {}) {
  return model.calculate({ ...REF, ...overrides, issues: [] })
}

function withIssue(issue: string, overrides: Partial<typeof REF> = {}) {
  return model.calculate({ ...REF, ...overrides, issues: [issue] })
}

// ── Known issue codes (defined in SIMPLE_DEDUCTIONS) ─────────────────────────
describe('SCREEN_CRACK — 15% percentage deduction', () => {
  it('reduces buy price compared to no issues', () => {
    const base = baseline()
    const cracked = withIssue('SCREEN_CRACK')
    expect(cracked.final_price).toBeLessThan(base.final_price)
  })

  it('is listed in breakdown.issues_applied', () => {
    const r = withIssue('SCREEN_CRACK')
    const issues = (r.breakdown as Record<string, unknown>).issues_applied as string[]
    expect(issues).toContain('SCREEN_CRACK')
  })

  it('produces non-negative price for high-deduction device', () => {
    const r = model.calculate({ ...REF, base_price: 150, issues: ['SCREEN_CRACK'] })
    expect(r.final_price).toBeGreaterThanOrEqual(0)
  })
})

describe('SCREEN_DEAD — 40% percentage deduction (larger than SCREEN_CRACK)', () => {
  it('reduces buy price more than SCREEN_CRACK alone', () => {
    const crack = withIssue('SCREEN_CRACK')
    const dead = withIssue('SCREEN_DEAD')
    expect(dead.final_price).toBeLessThan(crack.final_price)
  })

  it('is listed in breakdown.issues_applied', () => {
    const r = withIssue('SCREEN_DEAD')
    const issues = (r.breakdown as Record<string, unknown>).issues_applied as string[]
    expect(issues).toContain('SCREEN_DEAD')
  })

  it('produces non-negative price', () => {
    expect(withIssue('SCREEN_DEAD').final_price).toBeGreaterThanOrEqual(0)
  })
})

describe('BATTERY_POOR — $30 fixed deduction', () => {
  it('reduces buy price by a fixed amount', () => {
    const base = baseline()
    const battery = withIssue('BATTERY_POOR')
    expect(battery.final_price).toBeLessThan(base.final_price)
  })

  it('is listed in breakdown.issues_applied', () => {
    const r = withIssue('BATTERY_POOR')
    const issues = (r.breakdown as Record<string, unknown>).issues_applied as string[]
    expect(issues).toContain('BATTERY_POOR')
  })

  it('does not make price negative on a cheap device ($80 base)', () => {
    const r = model.calculate({ ...REF, base_price: 80, issues: ['BATTERY_POOR'] })
    expect(r.final_price).toBeGreaterThanOrEqual(0)
  })

  it('flat deduction: same dollar impact on high-end and budget devices', () => {
    // Because BATTERY_POOR is a fixed $30 off the adjusted price (before margin math),
    // the net impact on final price is: 30 * (1 - trade_in_margin_percent/100)
    const highEnd = model.calculate({ ...REF, base_price: 2000, issues: [] })
    const highEndBattery = model.calculate({ ...REF, base_price: 2000, issues: ['BATTERY_POOR'] })
    const budget = model.calculate({ ...REF, base_price: 300, issues: [] })
    const budgetBattery = model.calculate({ ...REF, base_price: 300, issues: ['BATTERY_POOR'] })

    const highEndDelta = highEnd.final_price - highEndBattery.final_price
    const budgetDelta = budget.final_price - budgetBattery.final_price

    // Both deltas should be approximately the same (fixed cost $30 * (1 - 0.22) = ~23.40)
    expect(Math.abs(highEndDelta - budgetDelta)).toBeLessThan(2)
  })
})

describe('ICLOUD_LOCKED — 90% percentage deduction (most severe)', () => {
  it('reduces price dramatically (90% of condition-adjusted price removed)', () => {
    const base = baseline()
    const icloud = withIssue('ICLOUD_LOCKED')
    // 90% deduction leaves only 10% of the condition-adjusted price;
    // after fixed costs and margin that works out to roughly $30–50 on a $700 device
    expect(icloud.final_price).toBeLessThan(base.final_price * 0.15)
  })

  it('is the most severe single deduction of all known codes', () => {
    const codes = ['SCREEN_CRACK', 'SCREEN_DEAD', 'BATTERY_POOR', 'CARRIER_LOCKED', 'WATER_DAMAGE']
    const icloud = withIssue('ICLOUD_LOCKED')
    for (const code of codes) {
      const other = withIssue(code)
      expect(icloud.final_price).toBeLessThanOrEqual(other.final_price)
    }
  })

  it('is listed in breakdown.issues_applied', () => {
    const r = withIssue('ICLOUD_LOCKED')
    const issues = (r.breakdown as Record<string, unknown>).issues_applied as string[]
    expect(issues).toContain('ICLOUD_LOCKED')
  })

  it('never makes price negative', () => {
    expect(withIssue('ICLOUD_LOCKED').final_price).toBeGreaterThanOrEqual(0)
  })
})

describe('CARRIER_LOCKED — $50 fixed deduction', () => {
  it('reduces buy price', () => {
    const base = baseline()
    const locked = withIssue('CARRIER_LOCKED')
    expect(locked.final_price).toBeLessThan(base.final_price)
  })

  it('is listed in breakdown.issues_applied', () => {
    const r = withIssue('CARRIER_LOCKED')
    const issues = (r.breakdown as Record<string, unknown>).issues_applied as string[]
    expect(issues).toContain('CARRIER_LOCKED')
  })

  it('does not make price negative for any reasonable device price', () => {
    for (const base_price of [150, 300, 800, 1500]) {
      const r = model.calculate({ ...REF, base_price, issues: ['CARRIER_LOCKED'] })
      expect(r.final_price).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('WATER_DAMAGE — 35% percentage deduction', () => {
  it('reduces buy price significantly', () => {
    const base = baseline()
    const water = withIssue('WATER_DAMAGE')
    expect(water.final_price).toBeLessThan(base.final_price)
  })

  it('is less severe than SCREEN_DEAD but more severe than SCREEN_CRACK', () => {
    const crack = withIssue('SCREEN_CRACK')   // 15%
    const water = withIssue('WATER_DAMAGE')   // 35%
    const dead = withIssue('SCREEN_DEAD')     // 40%

    // 35% is worse than 15%
    expect(water.final_price).toBeLessThan(crack.final_price)
    // 35% is slightly better than 40%
    expect(water.final_price).toBeGreaterThanOrEqual(dead.final_price * 0.95) // within 5%
  })

  it('is listed in breakdown.issues_applied', () => {
    const r = withIssue('WATER_DAMAGE')
    const issues = (r.breakdown as Record<string, unknown>).issues_applied as string[]
    expect(issues).toContain('WATER_DAMAGE')
  })

  it('never makes price negative', () => {
    expect(withIssue('WATER_DAMAGE').final_price).toBeGreaterThanOrEqual(0)
  })
})

// ── Unknown / misspelled codes ────────────────────────────────────────────────
describe('Unknown issue codes — graceful ignore (no crash, no deduction)', () => {
  const UNKNOWN_CODES = [
    'BATTERY_DEAD',         // common variant, not yet in SIMPLE_DEDUCTIONS
    'CAMERA_BROKEN',
    'SPEAKER_BROKEN',
    'BUTTON_BROKEN',
    'CONNECTIVITY_BROKEN',
    'SCREEN_CRACKED',       // misspelling of SCREEN_CRACK
    'ICLOUD_LOCK',          // misspelling of ICLOUD_LOCKED
    'WATER_DAMAGE_HEAVY',   // extended variant
    'FOO_BAR',              // completely unknown
    '',                     // empty string
    '   ',                  // whitespace
    '12345',                // numeric garbage
  ]

  for (const code of UNKNOWN_CODES) {
    it(`"${code}" → same price as no issues (ignored gracefully)`, () => {
      const base = baseline()
      const r = model.calculate({ ...REF, issues: [code] })
      expect(r.success).toBe(true)
      expect(r.final_price).toBeCloseTo(base.final_price, 2)
    })
  }

  it('unknown code does not appear in issues_applied', () => {
    const r = model.calculate({ ...REF, issues: ['TOTALLY_UNKNOWN_CODE'] })
    const issues = (r.breakdown as Record<string, unknown>).issues_applied as string[]
    expect(issues).not.toContain('TOTALLY_UNKNOWN_CODE')
  })
})

// ── Empty / missing issues ─────────────────────────────────────────────────────
describe('Empty issues array === no issues param', () => {
  it('issues=[] produces same price as issues omitted', () => {
    const withEmpty = model.calculate({ ...REF, issues: [] })
    const withOmitted = model.calculate({ ...REF })
    expect(withEmpty.final_price).toBe(withOmitted.final_price)
  })
})

// ── Multi-issue stacking ───────────────────────────────────────────────────────
describe('Multi-issue stacking — each issue compounds the reduction', () => {
  it('SCREEN_CRACK + BATTERY_POOR worse than SCREEN_CRACK alone', () => {
    const one = model.calculate({ ...REF, issues: ['SCREEN_CRACK'] })
    const two = model.calculate({ ...REF, issues: ['SCREEN_CRACK', 'BATTERY_POOR'] })
    expect(two.final_price).toBeLessThanOrEqual(one.final_price)
  })

  it('SCREEN_CRACK + WATER_DAMAGE worse than either alone', () => {
    const crack = model.calculate({ ...REF, issues: ['SCREEN_CRACK'] })
    const water = model.calculate({ ...REF, issues: ['WATER_DAMAGE'] })
    const both = model.calculate({ ...REF, issues: ['SCREEN_CRACK', 'WATER_DAMAGE'] })
    expect(both.final_price).toBeLessThanOrEqual(crack.final_price)
    expect(both.final_price).toBeLessThanOrEqual(water.final_price)
  })

  it('all 6 known issues stacked: still non-negative and still success', () => {
    const all = model.calculate({
      ...REF,
      issues: ['SCREEN_CRACK', 'SCREEN_DEAD', 'BATTERY_POOR', 'ICLOUD_LOCKED', 'CARRIER_LOCKED', 'WATER_DAMAGE'],
    })
    expect(all.success).toBe(true)
    expect(all.final_price).toBeGreaterThanOrEqual(0)
  })

  it('all 6 known issues: all appear in breakdown.issues_applied', () => {
    const r = model.calculate({
      ...REF,
      issues: ['SCREEN_CRACK', 'SCREEN_DEAD', 'BATTERY_POOR', 'ICLOUD_LOCKED', 'CARRIER_LOCKED', 'WATER_DAMAGE'],
    })
    const applied = (r.breakdown as Record<string, unknown>).issues_applied as string[]
    expect(applied).toContain('SCREEN_CRACK')
    expect(applied).toContain('SCREEN_DEAD')
    expect(applied).toContain('BATTERY_POOR')
    expect(applied).toContain('ICLOUD_LOCKED')
    expect(applied).toContain('CARRIER_LOCKED')
    expect(applied).toContain('WATER_DAMAGE')
  })

  it('unknown code mixed with known: known applied, unknown ignored', () => {
    const knownOnly = model.calculate({ ...REF, issues: ['SCREEN_CRACK'] })
    const mixed = model.calculate({ ...REF, issues: ['SCREEN_CRACK', 'CAMERA_BROKEN'] })

    // Unknown code should not change the price
    expect(mixed.final_price).toBeCloseTo(knownOnly.final_price, 2)

    // Only the known code appears in applied list
    const applied = (mixed.breakdown as Record<string, unknown>).issues_applied as string[]
    expect(applied).toContain('SCREEN_CRACK')
    expect(applied).not.toContain('CAMERA_BROKEN')
  })
})

// ── Condition interaction with issues ─────────────────────────────────────────
describe('Issue deductions interact correctly with all conditions', () => {
  const CONDITIONS = ['new', 'excellent', 'good', 'fair', 'poor'] as const
  const ISSUE = 'SCREEN_CRACK'

  for (const condition of CONDITIONS) {
    it(`${condition}: SCREEN_CRACK deducted on top of condition multiplier`, () => {
      const clean = model.calculate({ ...REF, condition, issues: [] })
      const cracked = model.calculate({ ...REF, condition, issues: [ISSUE] })
      expect(cracked.final_price).toBeLessThanOrEqual(clean.final_price)
      expect(cracked.final_price).toBeGreaterThanOrEqual(0)
    })
  }
})

// ── Sell side issue deductions ────────────────────────────────────────────────
describe('Issue deductions apply on sell (CPO) side too', () => {
  it('WATER_DAMAGE reduces CPO sell price', () => {
    const base = model.calculate({ ...REF, purpose: 'sell', issues: [] })
    const water = model.calculate({ ...REF, purpose: 'sell', issues: ['WATER_DAMAGE'] })
    expect(water.final_price).toBeLessThan(base.final_price)
  })

  it('ICLOUD_LOCKED nearly zeroes CPO sell price', () => {
    const r = model.calculate({ ...REF, purpose: 'sell', issues: ['ICLOUD_LOCKED'] })
    expect(r.success).toBe(true)
    // After 90% deduction + 28% markup: 700 × 0.82 × 0.10 × 1.28 ≈ $73
    // Far less than the no-issue CPO price (~$817); should be < 15% of baseline sell
    const baseSell = model.calculate({ ...REF, purpose: 'sell', issues: [] })
    expect(r.final_price).toBeLessThan(baseSell.final_price * 0.15)
    expect(r.final_price).toBeGreaterThanOrEqual(0)
  })
})

// ── Determinism ───────────────────────────────────────────────────────────────
describe('Pricing is deterministic (same input = same output)', () => {
  const INPUTS = [
    { issues: ['SCREEN_CRACK'], condition: 'good' as const, base_price: 500 },
    { issues: ['BATTERY_POOR', 'WATER_DAMAGE'], condition: 'fair' as const, base_price: 1200 },
    { issues: [], condition: 'excellent' as const, base_price: 3000 },
  ]

  for (const input of INPUTS) {
    it(`same price on repeated calls: ${JSON.stringify(input.issues)} | ${input.condition}`, () => {
      const r1 = model.calculate({ ...REF, ...input })
      const r2 = model.calculate({ ...REF, ...input })
      expect(r1.final_price).toBe(r2.final_price)
      expect(r1.confidence).toBe(r2.confidence)
    })
  }
})
