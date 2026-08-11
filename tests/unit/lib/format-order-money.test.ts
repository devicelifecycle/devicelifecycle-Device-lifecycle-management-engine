import { describe, it, expect } from 'vitest'
import { formatOrderMoney, orderCurrencyLabel } from '@/lib/utils'

describe('formatOrderMoney', () => {
  it('CAD orders show the CAD amount unconverted, labeled CA$', () => {
    const s = formatOrderMoney(100, 'CAD', 1.35)
    expect(s).toContain('100')
    expect(s).toContain('CA$')
  })

  it('USD orders convert by fx_rate and label US$', () => {
    // 100 CAD * 0.74 = 74 USD
    const s = formatOrderMoney(100, 'USD', 0.74)
    expect(s).toContain('74')
    expect(s).toContain('$')
    expect(s).not.toContain('CA$')
  })

  it('missing / zero fx_rate falls back to CAD (never mislabels a raw amount)', () => {
    expect(formatOrderMoney(100, 'USD', null)).toContain('CA$')
    expect(formatOrderMoney(100, 'USD', 0)).toContain('CA$')
    expect(formatOrderMoney(100, undefined, undefined)).toContain('CA$')
  })
})

describe('orderCurrencyLabel', () => {
  it('returns USD only for a USD order, else CAD', () => {
    expect(orderCurrencyLabel('USD')).toBe('USD')
    expect(orderCurrencyLabel('usd')).toBe('USD')
    expect(orderCurrencyLabel('CAD')).toBe('CAD')
    expect(orderCurrencyLabel(null)).toBe('CAD')
    expect(orderCurrencyLabel(undefined)).toBe('CAD')
  })
})
