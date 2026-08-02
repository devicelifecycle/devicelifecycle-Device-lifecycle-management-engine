// ============================================================================
// BILLING RECONCILIATION — a period's deals → invoice line items
// ============================================================================
// Turns the orders in a billing period into per-deal invoice line items, where
// each line's charge is Byte-Back's blended take (bbTake) from the commission
// engine. Pure — the API layer supplies the orders and persists the result.

import { computeDealPricing, type CommissionConfig } from './commission'
import { computeInvoiceTotals, type InvoiceLineItem, type InvoiceTotals } from './billing'

export interface PeriodOrder {
  order_number: string
  /** 'trade_in' | 'cpo' — anything else is treated as trade_in. */
  type: string
  /** The deal's market value the commission is computed from. */
  amount: number
}

export interface ReconcileResult {
  lineItems: InvoiceLineItem[]
  totals: InvoiceTotals
}

/**
 * Build invoice line items from a period's orders using the VAR's commission
 * config. Each line: description = order number, gross = deal value, commission
 * = BB's blended take. Optionally add a flat subscription fee.
 */
export function reconcilePeriod(
  orders: PeriodOrder[],
  config: CommissionConfig,
  subscriptionFee = 0,
): ReconcileResult {
  const lineItems: InvoiceLineItem[] = orders.map((o) => {
    const orderType = o.type === 'cpo' ? 'cpo' : 'trade_in'
    const { bbTake } = computeDealPricing({ orderType, marketValue: Math.max(0, o.amount || 0), config })
    return {
      description: o.order_number,
      grossAmount: Math.max(0, o.amount || 0),
      commissionAmount: bbTake,
    }
  })
  return { lineItems, totals: computeInvoiceTotals(lineItems, subscriptionFee) }
}
