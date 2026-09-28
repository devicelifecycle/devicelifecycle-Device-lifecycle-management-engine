import { describe, it, expect } from 'vitest'
import {
  resolveBillingMode, DEFAULT_BILLING_MODE, billableAmount, buildInvoiceDraft, isInvoiceable,
  invoiceBalance, maxRefundable, formatCustomerInvoiceNumber,
} from '@/lib/customer-billing'

describe('resolveBillingMode', () => {
  it('defaults to Option A so no existing tenant changes behaviour', () => {
    expect(resolveBillingMode(undefined)).toBe('external')
    expect(resolveBillingMode({})).toBe('external')
    expect(resolveBillingMode({ billingMode: 'nonsense' })).toBe('external')
    expect(DEFAULT_BILLING_MODE).toBe('external')
  })
  it('honours an explicit in_platform choice', () => {
    expect(resolveBillingMode({ billingMode: 'in_platform' })).toBe('in_platform')
  })
})

describe('billableAmount', () => {
  it('prefers final, then quoted, then total', () => {
    expect(billableAmount({ id: 'o', order_number: '1', final_amount: 100, quoted_amount: 90, total_amount: 80 })).toBe(100)
    expect(billableAmount({ id: 'o', order_number: '1', quoted_amount: 90, total_amount: 80 })).toBe(90)
    expect(billableAmount({ id: 'o', order_number: '1', total_amount: 80 })).toBe(80)
  })
  it('returns null rather than invoicing zero when no amount exists', () => {
    expect(billableAmount({ id: 'o', order_number: '1' })).toBeNull()
    expect(billableAmount({ id: 'o', order_number: '1', final_amount: 0, quoted_amount: null })).toBeNull()
    expect(billableAmount({ id: 'o', order_number: '1', final_amount: Number.NaN })).toBeNull()
  })
  it('never bills a negative amount', () => {
    expect(billableAmount({ id: 'o', order_number: '1', final_amount: -50, total_amount: 20 })).toBe(20)
  })
})

describe('isInvoiceable', () => {
  it('bills CPO only — a trade-in pays the customer, so it is never a charge', () => {
    expect(isInvoiceable({ id: 'o', order_number: '1', type: 'cpo' })).toBe(true)
    expect(isInvoiceable({ id: 'o', order_number: '1', type: 'trade_in' })).toBe(false)
    expect(isInvoiceable({ id: 'o', order_number: '1' })).toBe(false)
  })
})

describe('buildInvoiceDraft', () => {
  const orders = [
    { id: 'o1', order_number: 'CPO-1001', type: 'cpo', final_amount: 500, currency: 'CAD' },
    { id: 'o2', order_number: 'CPO-2002', type: 'cpo', quoted_amount: 250.5, currency: 'CAD' },
  ]

  it('sums billable CPO orders and applies the customer regional tax', () => {
    const d = buildInvoiceDraft({ orders, billingAddress: { state: 'ON', country: 'Canada' } })
    expect(d.lines).toHaveLength(2)
    expect(d.subtotal).toBe(750.5)
    expect(d.taxRate).toBeCloseTo(0.13, 5)
    expect(d.taxLabel).toMatch(/HST \(ON\)/)
    expect(d.taxAmount).toBe(97.57)
    expect(d.total).toBe(848.07)
    expect(d.skipped).toEqual([])
  })

  it('NEVER bills a trade-in — the money flows the other way', () => {
    const d = buildInvoiceDraft({
      orders: [...orders, { id: 'o3', order_number: 'TI-3', type: 'trade_in', final_amount: 900, currency: 'CAD' }],
      billingAddress: { state: 'ON' },
    })
    expect(d.lines.map((l) => l.order_id)).toEqual(['o1', 'o2'])
    expect(d.skipped).toContainEqual({ order_id: 'o3', reason: 'not_cpo' })
    // The trade-in's 900 must not reach the subtotal, and must not be taxed.
    expect(d.subtotal).toBe(750.5)
  })

  it('refuses to mix currencies into one total', () => {
    const d = buildInvoiceDraft({
      orders: [...orders, { id: 'o4', order_number: 'CPO-4', type: 'cpo', final_amount: 100, currency: 'USD' }],
      billingAddress: null,
    })
    expect(d.currency).toBe('CAD')
    expect(d.lines.map((l) => l.order_id)).toEqual(['o1', 'o2'])
    expect(d.skipped).toContainEqual({ order_id: 'o4', reason: 'currency_mismatch' })
    expect(d.subtotal).toBe(750.5)
  })

  it('takes its currency from the first billable order when none is given', () => {
    const d = buildInvoiceDraft({
      orders: [{ id: 'x', order_number: 'CPO-X', type: 'cpo', final_amount: 10, currency: 'usd' }],
      billingAddress: null,
    })
    expect(d.currency).toBe('USD')
    expect(d.lines).toHaveLength(1)
  })

  it('omits tax when the jurisdiction cannot be resolved, rather than guessing', () => {
    const d = buildInvoiceDraft({ orders, billingAddress: { country: 'Canada' } })
    expect(d.taxRate).toBe(0)
    expect(d.taxLabel).toBeNull()
    expect(d.taxAmount).toBe(0)
    expect(d.total).toBe(d.subtotal)
  })

  it('honours an explicitly non-taxable customer', () => {
    const d = buildInvoiceDraft({ orders, billingAddress: { state: 'ON' }, taxable: false })
    expect(d.taxAmount).toBe(0)
    expect(d.total).toBe(750.5)
  })

  it('reports orders with no billable amount instead of adding zero lines', () => {
    const d = buildInvoiceDraft({ orders: [...orders, { id: 'o5', order_number: 'CPO-5', type: 'cpo', final_amount: 0 }], billingAddress: null })
    expect(d.lines.map((l) => l.order_id)).toEqual(['o1', 'o2'])
    expect(d.skipped).toContainEqual({ order_id: 'o5', reason: 'no_amount' })
  })

  it('produces an empty, zero draft when nothing is billable', () => {
    const d = buildInvoiceDraft({ orders: [], billingAddress: { state: 'ON' } })
    expect(d.lines).toEqual([])
    expect(d.subtotal).toBe(0)
    expect(d.taxAmount).toBe(0)
    expect(d.total).toBe(0)
  })
})

describe('invoiceBalance', () => {
  it('nets refunds against payments', () => {
    const b = invoiceBalance(1000, [{ kind: 'payment', amount: 600 }, { kind: 'refund', amount: 100 }])
    expect(b).toMatchObject({ paid: 600, refunded: 100, netPaid: 500, balance: 500, settled: false })
  })

  it('marks settled only when fully covered', () => {
    expect(invoiceBalance(100, [{ kind: 'payment', amount: 100 }]).settled).toBe(true)
    expect(invoiceBalance(100, [{ kind: 'payment', amount: 99.99 }]).settled).toBe(false)
  })

  it('never reports a negative balance or negative net paid (the BB-billing bug)', () => {
    const over = invoiceBalance(100, [{ kind: 'payment', amount: 500 }])
    expect(over.balance).toBe(0)
    const overRefunded = invoiceBalance(100, [{ kind: 'payment', amount: 50 }, { kind: 'refund', amount: 500 }])
    expect(overRefunded.netPaid).toBe(0)
    expect(overRefunded.balance).toBe(100)
  })

  it('ignores malformed amounts rather than propagating NaN through the money', () => {
    const b = invoiceBalance(100, [{ kind: 'payment', amount: Number.NaN }, { kind: 'payment', amount: -20 }])
    expect(b.netPaid).toBe(0)
    expect(b.balance).toBe(100)
  })

  it('an unpaid zero-total invoice is not "settled"', () => {
    expect(invoiceBalance(0, []).settled).toBe(false)
  })
})

describe('maxRefundable', () => {
  it('caps a refund at what has actually been paid', () => {
    expect(maxRefundable([{ kind: 'payment', amount: 300 }, { kind: 'refund', amount: 100 }])).toBe(200)
    expect(maxRefundable([])).toBe(0)
  })
})

describe('formatCustomerInvoiceNumber', () => {
  it('is zero-padded and year-scoped', () => {
    expect(formatCustomerInvoiceNumber(2026, 1)).toBe('INV-2026-0001')
    expect(formatCustomerInvoiceNumber(2026, 1234)).toBe('INV-2026-1234')
  })
})
