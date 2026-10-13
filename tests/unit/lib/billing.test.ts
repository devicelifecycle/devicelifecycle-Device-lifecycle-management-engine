import { describe, it, expect } from 'vitest'
import {
  computeInvoiceTotals,
  formatInvoiceNumber,
  canTransitionInvoice,
  type InvoiceLineItem,
} from '@/lib/billing'

const lines: InvoiceLineItem[] = [
  { description: 'ORD-1', grossAmount: 1020, commissionAmount: 51 },
  { description: 'ORD-2', grossAmount: 500, commissionAmount: 25 },
]

describe('billing totals', () => {
  it('sums gross and commission across lines', () => {
    const t = computeInvoiceTotals(lines)
    expect(t.grossSubtotal).toBe(1520)
    expect(t.commissionTotal).toBe(76)
    expect(t.subscriptionFee).toBe(0)
    expect(t.taxRate).toBe(0)
    expect(t.taxAmount).toBe(0)
    expect(t.total).toBe(76)
  })

  it('adds a flat subscription fee to the total but not to commission', () => {
    const t = computeInvoiceTotals(lines, 199)
    expect(t.commissionTotal).toBe(76)
    expect(t.subscriptionFee).toBe(199)
    expect(t.subtotalBeforeTax).toBe(275)
    expect(t.total).toBe(275)
  })

  it('handles an empty period', () => {
    const t = computeInvoiceTotals([], 0)
    expect(t.grossSubtotal).toBe(0)
    expect(t.commissionTotal).toBe(0)
    expect(t.subscriptionFee).toBe(0)
    expect(t.taxRate).toBe(0)
    expect(t.taxAmount).toBe(0)
    expect(t.total).toBe(0)
  })

  it('rounds to cents', () => {
    const t = computeInvoiceTotals([{ description: 'x', grossAmount: 10.005, commissionAmount: 0.1 }], 0.005)
    expect(t.commissionTotal).toBe(0.1)
    expect(t.total).toBe(0.11)
  })

  it('applies tax to the subtotal', () => {
    const t = computeInvoiceTotals(lines, 100, { rate: 0.13, label: 'HST (ON)' })
    expect(t.commissionTotal).toBe(76)
    expect(t.subscriptionFee).toBe(100)
    expect(t.subtotalBeforeTax).toBe(176)
    expect(t.taxRate).toBe(0.13)
    expect(t.taxLabel).toBe('HST (ON)')
    expect(t.taxAmount).toBe(22.88)
    expect(t.total).toBe(198.88)
  })
})

describe('invoice numbering + status', () => {
  it('formats a zero-padded invoice number', () => {
    expect(formatInvoiceNumber(2026, 7)).toBe('INV-2026-0007')
    expect(formatInvoiceNumber(2026, 1234)).toBe('INV-2026-1234')
  })

  it('allows only valid status transitions', () => {
    expect(canTransitionInvoice('draft', 'sent')).toBe(true)
    expect(canTransitionInvoice('sent', 'paid')).toBe(true)
    expect(canTransitionInvoice('draft', 'void')).toBe(true)
    expect(canTransitionInvoice('draft', 'paid')).toBe(false)
    expect(canTransitionInvoice('paid', 'sent')).toBe(false)
    expect(canTransitionInvoice('void', 'draft')).toBe(false)
  })
})
