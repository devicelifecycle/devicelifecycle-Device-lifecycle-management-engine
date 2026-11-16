import { describe, expect, it } from 'vitest'
import { totalsAfterCredit, computeInvoiceTotals } from '@/lib/billing'

describe('totalsAfterCredit', () => {
  it('keeps tax on a credited invoice (13% HST, $100 fee, $20 credit)', () => {
    // Old route: total = 100 - 20 = 80 — the $10.40 of tax silently vanished.
    expect(totalsAfterCredit(0, 100, 0.13, 20)).toEqual({ taxAmount: 10.4, total: 90.4 })
  })

  it('matches computeInvoiceTotals when there is no credit', () => {
    const t = computeInvoiceTotals([{ description: 'x', grossAmount: 1000, commissionAmount: 50 }], 70, { rate: 0.13, label: 'HST' })
    expect(totalsAfterCredit(t.commissionTotal, t.subscriptionFee, t.taxRate, 0)).toEqual({ taxAmount: t.taxAmount, total: t.total })
  })

  it('floors at zero when the credit exceeds the subtotal', () => {
    expect(totalsAfterCredit(10, 5, 0.13, 50)).toEqual({ taxAmount: 0, total: 0 })
  })

  it('handles untaxed tenants', () => {
    expect(totalsAfterCredit(25, 75, 0, 10)).toEqual({ taxAmount: 0, total: 90 })
  })
})
