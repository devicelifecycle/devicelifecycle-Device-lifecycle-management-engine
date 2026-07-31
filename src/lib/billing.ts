// ============================================================================
// BILLING — BB ↔ VAR invoicing
// ============================================================================
// Aggregates each period's deals into what a VAR owes Byte-Back: the sum of
// BB's blended take (bbTake from the commission engine), plus any flat
// subscription fee. Pure functions only — the API/DB layers call these.

const round2 = (n: number) => Math.round(n * 100) / 100

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'

export interface InvoiceLineItem {
  /** Human label, e.g. the order number or a fee description. */
  description: string
  /** Gross deal value this line derives from (reporting context). */
  grossAmount: number
  /** What the VAR owes BB for this line (BB's platform take). */
  commissionAmount: number
}

export interface InvoiceTotals {
  /** Sum of gross deal values (context, not charged). */
  grossSubtotal: number
  /** Sum of BB's take across all deal lines. */
  commissionTotal: number
  /** Flat platform/subscription fee for the period. */
  subscriptionFee: number
  /** What the VAR actually owes: commissionTotal + subscriptionFee. */
  total: number
}

/** Roll a set of line items (plus an optional flat fee) into invoice totals. */
export function computeInvoiceTotals(
  lineItems: InvoiceLineItem[],
  subscriptionFee = 0,
): InvoiceTotals {
  const grossSubtotal = round2(lineItems.reduce((s, l) => s + l.grossAmount, 0))
  const commissionTotal = round2(lineItems.reduce((s, l) => s + l.commissionAmount, 0))
  const fee = round2(subscriptionFee)
  return {
    grossSubtotal,
    commissionTotal,
    subscriptionFee: fee,
    total: round2(commissionTotal + fee),
  }
}

/** Invoice number like INV-2026-0007 (period year + zero-padded sequence). */
export function formatInvoiceNumber(year: number, seq: number): string {
  return `INV-${year}-${String(seq).padStart(4, '0')}`
}

/** Which status transitions are allowed (draft→sent→paid, and →void). */
const NEXT: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['sent', 'void'],
  sent: ['paid', 'void'],
  paid: [],
  void: [],
}

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return NEXT[from]?.includes(to) ?? false
}
