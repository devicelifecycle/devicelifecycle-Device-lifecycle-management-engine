import { describe, expect, it } from 'vitest'
import { effectiveCpoMarkupPercent, DEFAULT_CPO_MARKUP_PERCENT } from '@/lib/cpo-markup'

describe('effectiveCpoMarkupPercent', () => {
  it('uses a real percent as-is (string or number)', () => {
    expect(effectiveCpoMarkupPercent('18')).toBe(18)
    expect(effectiveCpoMarkupPercent(25)).toBe(25)
    expect(effectiveCpoMarkupPercent('1')).toBe(1)
  })

  it('treats legacy fractions and junk as unset — never quotes at cost', () => {
    // Live prod value that quoted CPO customers at vendor cost + 0.01%
    expect(effectiveCpoMarkupPercent('0.01')).toBe(DEFAULT_CPO_MARKUP_PERCENT)
    expect(effectiveCpoMarkupPercent(0.18)).toBe(DEFAULT_CPO_MARKUP_PERCENT)
    expect(effectiveCpoMarkupPercent(0)).toBe(DEFAULT_CPO_MARKUP_PERCENT)
    expect(effectiveCpoMarkupPercent(-5)).toBe(DEFAULT_CPO_MARKUP_PERCENT)
    expect(effectiveCpoMarkupPercent(undefined)).toBe(DEFAULT_CPO_MARKUP_PERCENT)
    expect(effectiveCpoMarkupPercent('abc')).toBe(DEFAULT_CPO_MARKUP_PERCENT)
  })
})
