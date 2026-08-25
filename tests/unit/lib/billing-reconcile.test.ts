import { describe, it, expect } from 'vitest'
import { reconcilePeriod, type PeriodOrder } from '@/lib/billing-reconcile'
import { DEFAULT_COMMISSION_CONFIG, type CommissionConfig } from '@/lib/commission'

const config: CommissionConfig = { ...DEFAULT_COMMISSION_CONFIG, platformCommissionPct: 0.05 }

const orders: PeriodOrder[] = [
  { order_number: 'ORD-1', type: 'trade_in', amount: 1000 }, // bbTake 50
  { order_number: 'ORD-2', type: 'cpo', amount: 2000 },      // bbTake 100
]

describe('billing reconciliation', () => {
  it('makes one line item per order with BB take as the charge', () => {
    const { lineItems } = reconcilePeriod(orders, config)
    expect(lineItems).toHaveLength(2)
    expect(lineItems[0]).toEqual({ description: 'ORD-1', grossAmount: 1000, commissionAmount: 50 })
    expect(lineItems[1]).toEqual({ description: 'ORD-2', grossAmount: 2000, commissionAmount: 100 })
  })

  it('totals the commission across the period', () => {
    const { totals } = reconcilePeriod(orders, config)
    expect(totals.grossSubtotal).toBe(3000)
    expect(totals.commissionTotal).toBe(150)
    expect(totals.total).toBe(150)
  })

  it('adds a subscription fee to the total but not to commission', () => {
    const { totals } = reconcilePeriod(orders, config, 199)
    expect(totals.commissionTotal).toBe(150)
    expect(totals.subscriptionFee).toBe(199)
    expect(totals.total).toBe(349)
  })

  it('handles an empty period and treats unknown types as trade-in', () => {
    expect(reconcilePeriod([], config).totals.total).toBe(0)
    const weird = reconcilePeriod([{ order_number: 'X', type: 'unknown', amount: 1000 }], config)
    expect(weird.lineItems[0].commissionAmount).toBe(50) // priced as trade-in
  })

  it('charges holdback as part of the blended BB take, consistent with the engine', () => {
    // In this model holdback is one of the three blended charges (commission +
    // product margin + holdback) that make up bbTake, so a VAR invoice bills all
    // of them together -- holdback reporting happens separately in commission-
    // report.ts. Here 5% commission + 3% margin + 2% holdback = 10% take.
    const withHoldback: CommissionConfig = {
      ...config,
      productMarginPct: 0.03,
      holdbackPct: 0.02,
    }
    const { lineItems } = reconcilePeriod([{ order_number: 'ORD-H', type: 'trade_in', amount: 500 }], withHoldback)
    expect(lineItems[0].commissionAmount).toBe(50) // 10% of 500
  })

  it('rounds each line to 2 decimal places, half up', () => {
    // 33.33 * 0.05 = 1.6665 -> 1.67 (round-half-up at the cent boundary)
    const { lineItems } = reconcilePeriod([{ order_number: 'ORD-R', type: 'cpo', amount: 33.33 }], config)
    expect(lineItems[0].commissionAmount).toBe(1.67)
    expect(lineItems[0].grossAmount).toBe(33.33)
  })

  it('passes amounts through without any currency conversion (fx-agnostic)', () => {
    // The calculator works in raw numbers; whatever currency the orders carry,
    // values flow into lines/totals untouched so the invoice row''s own
    // currency column stays the single source of truth for display.
    const cadOrders = [{ order_number: 'ORD-CAD', type: 'trade_in', amount: 250 }]
    const usdOrders = [{ order_number: 'ORD-USD', type: 'trade_in', amount: 250 }]
    const a = reconcilePeriod(cadOrders, config)
    const b = reconcilePeriod(usdOrders, config)
    expect(a.totals).toEqual(b.totals)
    expect(a.lineItems[0].commissionAmount).toBe(12.5)
  })
})
