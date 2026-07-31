import { describe, it, expect } from 'vitest'
import { summarizeDeals, effectiveTakeRate, projectVolume, type ReportDeal } from '@/lib/commission-report'
import type { CommissionConfig } from '@/lib/commission'

// Mirrors the outline's worked examples.
const config: CommissionConfig = {
  platformCommissionPct: 0.05,
  productMarginPct: 0,
  holdbackPct: 0,
  corpMargin: { type: 'fixed', value: 5 },
  repMargin: { type: 'fixed', value: 3 },
}

const deals: ReportDeal[] = [
  { orderType: 'trade_in', marketValue: 110, config }, // BB take 5.50, customer 96.50
  { orderType: 'cpo', marketValue: 1000, config },     // BB take 50, customer 1058
]

describe('commission reporting', () => {
  it('empty set returns all-zero summary', () => {
    const s = summarizeDeals([])
    expect(s.dealCount).toBe(0)
    expect(s.bbTake).toBe(0)
    expect(effectiveTakeRate(s)).toBe(0)
  })

  it('counts trade-ins and CPO separately', () => {
    const s = summarizeDeals(deals)
    expect(s.dealCount).toBe(2)
    expect(s.tradeInCount).toBe(1)
    expect(s.cpoCount).toBe(1)
  })

  it('aggregates gross volume and BB take', () => {
    const s = summarizeDeals(deals)
    expect(s.grossVolume).toBe(1110)
    // 5% of 110 = 5.50, 5% of 1000 = 50
    expect(s.bbPlatformCommission).toBe(55.5)
    expect(s.bbTake).toBe(55.5)
  })

  it('aggregates VAR corp/rep margins', () => {
    const s = summarizeDeals(deals)
    expect(s.corpMargin).toBe(10) // 5 + 5
    expect(s.repMargin).toBe(6)   // 3 + 3
    expect(s.varMargin).toBe(16)
  })

  it('effective take rate is BB take over gross volume', () => {
    const s = summarizeDeals(deals)
    expect(effectiveTakeRate(s)).toBe(round2(55.5 / 1110))
  })
})

describe('analytic volume projection (O(1))', () => {
  it('matches the per-deal summary for a uniform volume', () => {
    const materialized: ReportDeal[] = [
      ...Array.from({ length: 40 }, () => ({ orderType: 'trade_in' as const, marketValue: 110, config })),
      ...Array.from({ length: 20 }, () => ({ orderType: 'cpo' as const, marketValue: 1000, config })),
    ]
    const viaDeals = summarizeDeals(materialized)
    const viaProjection = projectVolume({ tradeInCount: 40, tradeInValue: 110, cpoCount: 20, cpoValue: 1000, config })
    expect(viaProjection).toEqual(viaDeals)
  })

  it('scales to millions of deals without materializing arrays', () => {
    const s = projectVolume({ tradeInCount: 2_000_000, tradeInValue: 110, cpoCount: 1_000_000, cpoValue: 1000, config })
    expect(s.dealCount).toBe(3_000_000)
    // 2M trade-ins * 5.50 + 1M CPO * 50 = 11,000,000 + 50,000,000
    expect(s.bbTake).toBe(61_000_000)
  })

  it('handles zero counts on either side', () => {
    expect(projectVolume({ tradeInCount: 0, tradeInValue: 110, cpoCount: 0, cpoValue: 1000, config }).dealCount).toBe(0)
    const onlyTradeIns = projectVolume({ tradeInCount: 3, tradeInValue: 110, cpoCount: 0, cpoValue: 1000, config })
    expect(onlyTradeIns.cpoCount).toBe(0)
    expect(onlyTradeIns.bbTake).toBe(16.5)
  })
})

const round2 = (n: number) => Math.round(n * 100) / 100
