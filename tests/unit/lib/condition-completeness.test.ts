// ============================================================================
// GUARD: every DeviceCondition must be fully wired through the shared surfaces.
//
// The condition→multiplier data is (regrettably) duplicated across many maps.
// TypeScript catches the Record<DeviceCondition,..> ones, but several pricing
// maps are Record<string,..> and slip past the compiler. This test locks the
// two SHARED, exported surfaces every new grade must pass through, so adding a
// condition to the enum without wiring it up fails loudly here.
// ============================================================================

import { describe, it, expect } from 'vitest'
import { CONDITION_CONFIG } from '@/lib/constants'
import { DEVICE_CONDITION_VALUES } from '@/lib/validations'
import { normalizePricingCondition } from '@/lib/condition'

describe('DeviceCondition completeness', () => {
  it('CONDITION_CONFIG defines every condition with a numeric multiplier', () => {
    for (const c of DEVICE_CONDITION_VALUES) {
      expect(CONDITION_CONFIG[c], `CONDITION_CONFIG is missing '${c}'`).toBeDefined()
      expect(typeof CONDITION_CONFIG[c].multiplier).toBe('number')
    }
  })

  it('the shared normalizer recognizes every condition (no silent default to good)', () => {
    for (const c of DEVICE_CONDITION_VALUES) {
      // A canonical condition name must normalize to itself. If a future grade is
      // added to the enum but not to src/lib/condition.ts, it would fall through
      // to the 'good' default and this assertion would catch it.
      expect(normalizePricingCondition(c), `'${c}' is not recognized by normalizePricingCondition`).toBe(c)
    }
  })

  it('certified is priced as the excellent tier', () => {
    expect(CONDITION_CONFIG.certified.multiplier).toBe(CONDITION_CONFIG.excellent.multiplier)
    expect(normalizePricingCondition('cpo')).toBe('certified')
    expect(normalizePricingCondition('refurbished')).toBe('certified')
  })
})
