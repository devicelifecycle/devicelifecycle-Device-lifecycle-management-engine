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
})
