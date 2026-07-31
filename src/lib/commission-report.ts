// ============================================================================
// COMMISSION REPORTING — aggregate deals into a BB-side breakdown
// ============================================================================
// BB Admin reporting separates every blended charge across a set of deals; the
// VAR only ever sees the blended prices. Pure aggregation over the commission
// engine's per-deal output.

import { computeDealPricing, type CommissionConfig, type CommissionResult } from './commission'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface ReportDeal {
  orderType: 'trade_in' | 'cpo'
  marketValue: number
  config: CommissionConfig
}

export interface CommissionSummary {
  dealCount: number
  tradeInCount: number
  cpoCount: number
  /** Sum of reference market values. */
  grossVolume: number
  /** BB platform commission across all deals. */
  bbPlatformCommission: number
  /** BB product margin across all deals. */
  bbProductMargin: number
  /** BB total blended take (commission + product margin). */
  bbTake: number
  /** VAR corp margin across all deals. */
  corpMargin: number
  /** VAR rep margin across all deals. */
  repMargin: number
  /** VAR total margin. */
  varMargin: number
  /** Net customer value moved (paid out on trade-ins + charged on CPO). */
  customerVolume: number
}

const EMPTY: CommissionSummary = {
  dealCount: 0, tradeInCount: 0, cpoCount: 0, grossVolume: 0,
  bbPlatformCommission: 0, bbProductMargin: 0, bbTake: 0,
  corpMargin: 0, repMargin: 0, varMargin: 0, customerVolume: 0,
}

/** Roll a set of deals into a BB-side commission summary. */
export function summarizeDeals(deals: ReportDeal[]): CommissionSummary {
  const acc = deals.reduce<CommissionSummary>((s, d) => {
    const r: CommissionResult = computeDealPricing(d)
    return {
      dealCount: s.dealCount + 1,
      tradeInCount: s.tradeInCount + (r.orderType === 'trade_in' ? 1 : 0),
      cpoCount: s.cpoCount + (r.orderType === 'cpo' ? 1 : 0),
      grossVolume: s.grossVolume + r.marketValue,
      bbPlatformCommission: s.bbPlatformCommission + r.bbPlatformCommission,
      bbProductMargin: s.bbProductMargin + r.bbProductMargin,
      bbTake: s.bbTake + r.bbTake,
      corpMargin: s.corpMargin + r.corpMargin,
      repMargin: s.repMargin + r.repMargin,
      varMargin: s.varMargin + r.varMargin,
      customerVolume: s.customerVolume + r.customerAmount,
    }
  }, { ...EMPTY })

  // Round every monetary field once, at the end.
  return {
    ...acc,
    grossVolume: round2(acc.grossVolume),
    bbPlatformCommission: round2(acc.bbPlatformCommission),
    bbProductMargin: round2(acc.bbProductMargin),
    bbTake: round2(acc.bbTake),
    corpMargin: round2(acc.corpMargin),
    repMargin: round2(acc.repMargin),
    varMargin: round2(acc.varMargin),
    customerVolume: round2(acc.customerVolume),
  }
}

/** Average BB take as a fraction of gross volume (0 when there's no volume). */
export function effectiveTakeRate(summary: CommissionSummary): number {
  if (summary.grossVolume <= 0) return 0
  return round2(summary.bbTake / summary.grossVolume)
}

export interface VolumeProjection {
  tradeInCount: number
  tradeInValue: number
  cpoCount: number
  cpoValue: number
  config: CommissionConfig
}

/**
 * Analytic projection for a uniform volume — O(1), never materializes per-deal
 * arrays. Computes one representative trade-in and one CPO result, then scales
 * by count. Safe for arbitrarily large volumes (millions of deals).
 */
export function projectVolume(input: VolumeProjection): CommissionSummary {
  const tradeInCount = Math.max(0, Math.floor(input.tradeInCount || 0))
  const cpoCount = Math.max(0, Math.floor(input.cpoCount || 0))

  const ti = tradeInCount > 0
    ? computeDealPricing({ orderType: 'trade_in', marketValue: Math.max(0, input.tradeInValue || 0), config: input.config })
    : null
  const cp = cpoCount > 0
    ? computeDealPricing({ orderType: 'cpo', marketValue: Math.max(0, input.cpoValue || 0), config: input.config })
    : null

  return {
    dealCount: tradeInCount + cpoCount,
    tradeInCount,
    cpoCount,
    grossVolume: round2((ti ? ti.marketValue * tradeInCount : 0) + (cp ? cp.marketValue * cpoCount : 0)),
    bbPlatformCommission: round2((ti ? ti.bbPlatformCommission * tradeInCount : 0) + (cp ? cp.bbPlatformCommission * cpoCount : 0)),
    bbProductMargin: round2((ti ? ti.bbProductMargin * tradeInCount : 0) + (cp ? cp.bbProductMargin * cpoCount : 0)),
    bbTake: round2((ti ? ti.bbTake * tradeInCount : 0) + (cp ? cp.bbTake * cpoCount : 0)),
    corpMargin: round2((ti ? ti.corpMargin * tradeInCount : 0) + (cp ? cp.corpMargin * cpoCount : 0)),
    repMargin: round2((ti ? ti.repMargin * tradeInCount : 0) + (cp ? cp.repMargin * cpoCount : 0)),
    varMargin: round2((ti ? ti.varMargin * tradeInCount : 0) + (cp ? cp.varMargin * cpoCount : 0)),
    customerVolume: round2((ti ? ti.customerAmount * tradeInCount : 0) + (cp ? cp.customerAmount * cpoCount : 0)),
  }
}
