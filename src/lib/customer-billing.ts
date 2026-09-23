// ============================================================================
// VAR → END-CUSTOMER BILLING (the outline's Billing Option A / Option B)
// ============================================================================
// Open since 2026-08-17, answered 2026-09-22: BOTH modes are supported, chosen
// per VAR.
//
//   external     (Option A) — the VAR bills its customer in its own system.
//                 The platform stays out of it. This is the DEFAULT, so no
//                 existing tenant's behaviour changes.
//   in_platform  (Option B) — the VAR raises invoices here: build from the
//                 customer's completed orders, apply the customer's regional
//                 tax, send, and record payments against the balance.
//
// Payment COLLECTION is out of scope on purpose — the gateway choice is still
// deferred, so payments are recorded manually, exactly like the BB→VAR
// invoices already work. An invoice therefore tells the truth about what is
// owed without implying we can charge a card.
//
// Everything here is pure: no I/O, so the money arithmetic is testable.

import { resolveTaxRate, computeTax } from '@/lib/tax'

export const BILLING_MODES = ['external', 'in_platform'] as const
export type BillingMode = (typeof BILLING_MODES)[number]
export const DEFAULT_BILLING_MODE: BillingMode = 'external'

export const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  external: 'Option A — we bill our customers in our own system',
  in_platform: 'Option B — raise and track customer invoices here',
}

/** Read `settings.billingMode`, falling back to Option A for anything unrecognised. */
export function resolveBillingMode(settings: unknown): BillingMode {
  const v = (settings && typeof settings === 'object'
    ? (settings as { billingMode?: unknown }).billingMode
    : undefined)
  return typeof v === 'string' && (BILLING_MODES as readonly string[]).includes(v)
    ? (v as BillingMode)
    : DEFAULT_BILLING_MODE
}

export interface BillableOrder {
  id: string
  order_number: string
  type?: string | null
  /** What the customer owes for this order. */
  final_amount?: number | null
  quoted_amount?: number | null
  total_amount?: number | null
  currency?: string | null
  completed_at?: string | null
}

export interface DraftLine {
  order_id: string
  description: string
  quantity: number
  unit_amount: number
  amount: number
}

export interface InvoiceDraft {
  lines: DraftLine[]
  subtotal: number
  taxRate: number
  taxLabel: string | null
  taxAmount: number
  total: number
  currency: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The amount a customer is billed for an order: the final settled amount when
 * one exists, else the accepted quote, else the order total. Never invents a
 * number — an order with none of the three is not billable and the caller
 * drops it rather than invoicing zero.
 */
export function billableAmount(order: BillableOrder): number | null {
  for (const v of [order.final_amount, order.quoted_amount, order.total_amount]) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return round2(v)
  }
  return null
}

/**
 * Build an invoice draft from orders. Tax comes from the CUSTOMER's billing
 * address (they are the party being taxed), through the same engine the order
 * PDFs use, so an invoice and the order documents can never disagree. An
 * unresolvable jurisdiction yields no tax line rather than a guessed rate.
 */
export function buildInvoiceDraft(params: {
  orders: BillableOrder[]
  billingAddress?: Record<string, unknown> | string | null
  currency?: string | null
  /** Set false for a customer the VAR does not charge tax to (e.g. resale). */
  taxable?: boolean
}): InvoiceDraft {
  const lines: DraftLine[] = []
  for (const o of params.orders) {
    const amount = billableAmount(o)
    if (amount === null) continue
    lines.push({
      order_id: o.id,
      description: `${(o.type === 'cpo' ? 'CPO' : 'Trade-in')} order ${o.order_number}`,
      quantity: 1,
      unit_amount: amount,
      amount,
    })
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0))

  const addr = params.billingAddress
  const region = addr && typeof addr === 'object'
    ? String((addr as Record<string, unknown>).state ?? (addr as Record<string, unknown>).province ?? '')
    : ''
  const country = addr && typeof addr === 'object' ? String((addr as Record<string, unknown>).country ?? '') : ''
  const tax = params.taxable === false ? { rate: 0, label: '' } : resolveTaxRate(region, country)
  const taxAmount = tax.rate > 0 && subtotal > 0 ? computeTax(subtotal, tax.rate) : 0

  return {
    lines,
    subtotal,
    taxRate: tax.rate,
    taxLabel: tax.rate > 0 ? tax.label : null,
    taxAmount,
    total: round2(subtotal + taxAmount),
    currency: params.currency || 'CAD',
  }
}

export interface PaymentRow { kind: 'payment' | 'refund'; amount: number }

export interface InvoiceBalance {
  paid: number
  refunded: number
  netPaid: number
  balance: number
  settled: boolean
}

/**
 * Outstanding balance. Refunds reduce net paid, and net paid is floored at 0 —
 * the BB→VAR billing had a bug where unbounded refunds drove it negative, and
 * the same arithmetic must not repeat here.
 */
export function invoiceBalance(total: number, payments: PaymentRow[]): InvoiceBalance {
  let paid = 0
  let refunded = 0
  for (const p of payments) {
    const amt = Number.isFinite(p.amount) ? Math.max(0, p.amount) : 0
    if (p.kind === 'refund') refunded += amt
    else paid += amt
  }
  paid = round2(paid)
  refunded = round2(refunded)
  const netPaid = round2(Math.max(0, paid - refunded))
  const balance = round2(Math.max(0, total - netPaid))
  return { paid, refunded, netPaid, balance, settled: balance <= 0 && total > 0 }
}

/** A refund can never exceed what has actually been paid on the invoice. */
export function maxRefundable(payments: PaymentRow[]): number {
  return invoiceBalance(0, payments).netPaid
}

export function formatCustomerInvoiceNumber(year: number, seq: number): string {
  return `INV-${year}-${String(seq).padStart(4, '0')}`
}
