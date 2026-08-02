// ============================================================================
// INVOICE PAYMENTS — payment / refund summary
// ============================================================================
// Records against an invoice roll up into paid, refunded, net, and outstanding
// balance. Pure — the API supplies the records and persists the result.

const round2 = (n: number) => Math.round(n * 100) / 100

export type PaymentKind = 'payment' | 'refund'
export interface PaymentRecord { kind: PaymentKind; amount: number }

export interface PaymentSummary {
  paid: number
  refunded: number
  /** paid − refunded */
  net: number
  /** invoiceTotal − net (never below 0) */
  balance: number
  fullyPaid: boolean
}

export function summarizePayments(invoiceTotal: number, records: PaymentRecord[]): PaymentSummary {
  let paid = 0, refunded = 0
  for (const r of records) {
    const amt = Math.max(0, r.amount || 0)
    if (r.kind === 'refund') refunded += amt
    else paid += amt
  }
  paid = round2(paid); refunded = round2(refunded)
  const net = round2(paid - refunded)
  const balance = round2(Math.max(0, (invoiceTotal || 0) - net))
  return { paid, refunded, net, balance, fullyPaid: balance <= 0 && (invoiceTotal || 0) > 0 }
}
