import { describe, it, expect } from 'vitest'
import { isSupportedCurrency, convertFromCad, formatMoney, getCadToRate } from '@/lib/fx'

describe('fx helpers', () => {
  it('recognizes supported currencies (case-insensitive)', () => {
    expect(isSupportedCurrency('CAD')).toBe(true)
    expect(isSupportedCurrency('usd')).toBe(true)
    expect(isSupportedCurrency('EUR')).toBe(false)
    expect(isSupportedCurrency(null)).toBe(false)
  })

  it('converts CAD to a currency by its frozen rate, rounded to cents', () => {
    expect(convertFromCad(100, 1)).toBe(100)
    expect(convertFromCad(100, 0.7353)).toBe(73.53)
    expect(convertFromCad(350, 0)).toBe(350) // guards against a 0 rate
  })

  it('formats money with the currency code', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1234.50 USD')
    expect(formatMoney(10, 'cad')).toBe('$10.00 CAD')
  })

  it('getCadToRate returns 1 for CAD without any network call', async () => {
    expect(await getCadToRate('CAD')).toBe(1)
    expect(await getCadToRate('cad')).toBe(1)
  })

  it('getCadToRate returns null for unsupported currencies', async () => {
    expect(await getCadToRate('EUR')).toBeNull()
  })
})
