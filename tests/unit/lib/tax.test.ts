import { describe, it, expect } from 'vitest'
import { resolveTaxRate, computeTax, computeOrderTaxLine, formatTaxPercent } from '@/lib/tax'

describe('resolveTaxRate — Canada', () => {
  it('resolves Ontario HST by code and by name', () => {
    expect(resolveTaxRate('ON', 'Canada').rate).toBe(0.13)
    expect(resolveTaxRate('Ontario', 'Canada').rate).toBe(0.13)
    expect(resolveTaxRate('ontario').label).toBe('HST (ON)')
  })
  it('defaults country to Canada when blank', () => {
    expect(resolveTaxRate('BC').rate).toBe(0.12)
    expect(resolveTaxRate('QC').rate).toBeCloseTo(0.14975, 5)
  })
  it('is not a placeholder for Canadian provinces', () => {
    expect(resolveTaxRate('AB', 'Canada').isPlaceholder).toBe(false)
  })
})

describe('resolveTaxRate — US (placeholder)', () => {
  it('resolves state base rate by code and name, flagged as placeholder', () => {
    const ca = resolveTaxRate('CA', 'United States')
    expect(ca.rate).toBe(0.0725)
    expect(ca.isPlaceholder).toBe(true)
    expect(resolveTaxRate('california', 'USA').rate).toBe(0.0725)
  })
  it('returns 0 for no-sales-tax states', () => {
    expect(resolveTaxRate('OR', 'US').rate).toBe(0)
  })
})

describe('resolveTaxRate — unresolvable', () => {
  it('returns rate 0 for empty or unknown region', () => {
    expect(resolveTaxRate('', 'Canada').rate).toBe(0)
    expect(resolveTaxRate('Atlantis', 'Canada').rate).toBe(0)
  })
})

describe('computeTax + formatTaxPercent', () => {
  it('rounds tax to cents', () => {
    expect(computeTax(350, 0.13)).toBe(45.5)
    expect(computeTax(199.99, 0.13)).toBe(26)
  })
  it('formats whole vs fractional percents', () => {
    expect(formatTaxPercent(0.13)).toBe('13%')
    expect(formatTaxPercent(0.14975)).toBe('14.975%')
  })
})

describe('computeOrderTaxLine', () => {
  it('taxes a CPO order with a resolvable address', () => {
    const line = computeOrderTaxLine({ type: 'cpo', subtotal: 1000, billingAddress: { province: 'ON', country: 'Canada' } })
    expect(line).not.toBeNull()
    expect(line!.taxAmount).toBe(130)
    expect(line!.total).toBe(1130)
    expect(line!.label).toBe('HST (ON) 13%')
  })
  it('returns null for trade-in orders (payouts are not taxed here)', () => {
    expect(computeOrderTaxLine({ type: 'trade_in', subtotal: 1000, billingAddress: { province: 'ON' } })).toBeNull()
  })
  it('returns null when subtotal is zero or address is unresolvable', () => {
    expect(computeOrderTaxLine({ type: 'cpo', subtotal: 0, billingAddress: { province: 'ON' } })).toBeNull()
    expect(computeOrderTaxLine({ type: 'cpo', subtotal: 500, billingAddress: 'freeform string address' })).toBeNull()
  })
  it('flags US placeholder tax in the label', () => {
    const line = computeOrderTaxLine({ type: 'cpo', subtotal: 100, billingAddress: { state: 'CA', country: 'US' } })
    expect(line!.label).toContain('(est.)')
  })
})
