// ============================================================================
// COMMISSION / MARGIN ENGINE (VAR platform revenue model)
// ============================================================================
// Implements the blended-pricing model from the BB VAR Outline:
//
//   Byte-Back revenue (blended into the price, never a line item to the VAR):
//     • Platform Commission %  — admin-set, adjustable deal-by-deal
//     • Product Margin %       — when BB buys/resells
//
//   VAR revenue (VAR-set input fields):
//     • Corp margin  — the VAR entity's cut
//     • Rep margin   — the individual rep's cut
//
//   Money flow (from the outline's worked examples):
//     Trade-in (customer SELLS): BB pays VAR $110 → VAR deducts corp $5 + rep $3
//                                → customer receives $102.
//     CPO      (customer BUYS):  VAR pays BB $1,020 → VAR adds corp $50 + rep $30
//                                → customer charged $1,100.
//
// The engine returns a full breakdown so BB Admin reporting can separate each
// blended charge, while the VAR only ever sees the blended prices.
// ============================================================================

const round2 = (n: number) => Math.round(n * 100) / 100

/** A margin can be a flat amount or a percentage of the VAR price. */
export interface MarginSpec {
  type: 'fixed' | 'percent'
  /** Dollars when type='fixed'; a fraction (0.05 = 5%) when type='percent'. */
  value: number
}

export interface CommissionConfig {
  /** BB platform commission, as a fraction of the market value (0.05 = 5%). */
  platformCommissionPct: number
  /** BB product margin, as a fraction of the market value (0.05 = 5%). */
  productMarginPct: number
  /** BB holdback withheld from the blended price, as a fraction of market value
   *  (0.02 = 2%). Reported separately in commission/holdback reporting. */
  holdbackPct: number
  /** VAR entity margin. */
  corpMargin: MarginSpec
  /** Individual rep margin. */
  repMargin: MarginSpec
}

export interface CommissionResult {
  orderType: 'trade_in' | 'cpo'
  /** Reference market value the deal is built from. */
  marketValue: number
  /** BB platform commission ($) — reporting only, blended into varPrice. */
  bbPlatformCommission: number
  /** BB product margin ($) — reporting only, blended into varPrice. */
  bbProductMargin: number
  /** BB holdback ($) — reporting only, blended into varPrice, released per policy. */
  bbHoldback: number
  /** BB's total blended take ($) = commission + product margin + holdback. */
  bbTake: number
  /** The blended BB↔VAR price (what BB pays the VAR for trade-in, or what the
   *  VAR pays BB for CPO). This is all the VAR sees of BB's side. */
  varPrice: number
  /** VAR entity margin ($). */
  corpMargin: number
  /** Rep margin ($). */
  repMargin: number
  /** VAR's total margin ($). */
  varMargin: number
  /** Final amount the customer receives (trade-in) or is charged (CPO). */
  customerAmount: number
}

export const DEFAULT_COMMISSION_CONFIG: CommissionConfig = {
  platformCommissionPct: 0.05,
  productMarginPct: 0,
  holdbackPct: 0,
  corpMargin: { type: 'fixed', value: 0 },
  repMargin: { type: 'fixed', value: 0 },
}

function resolveMargin(spec: MarginSpec, base: number): number {
  const v = spec?.type === 'percent' ? base * (spec.value || 0) : (spec?.value || 0)
  return round2(Math.max(0, v))
}

/**
 * Compute the full blended pricing + revenue breakdown for a deal.
 *
 * - Trade-in: BB keeps its commission+margin out of the market value, so the
 *   VAR price is LOWER than market; the VAR then deducts its corp+rep margins,
 *   so the customer receives LESS than the VAR price.
 * - CPO: BB adds its commission+margin onto the base, so the VAR price is HIGHER;
 *   the VAR then adds its corp+rep margins, so the customer is charged MORE.
 */
export function computeDealPricing(input: {
  orderType: 'trade_in' | 'cpo'
  marketValue: number
  config: CommissionConfig
}): CommissionResult {
  const { orderType, marketValue, config } = input
  const isCpo = orderType === 'cpo'

  const bbPlatformCommission = round2(Math.max(0, marketValue) * (config.platformCommissionPct || 0))
  const bbProductMargin = round2(Math.max(0, marketValue) * (config.productMarginPct || 0))
  const bbHoldback = round2(Math.max(0, marketValue) * (config.holdbackPct || 0))
  const bbTake = round2(bbPlatformCommission + bbProductMargin + bbHoldback)

  const varPrice = isCpo
    ? round2(marketValue + bbTake) // VAR pays BB (BB adds its blended take)
    : round2(marketValue - bbTake) // BB pays VAR (BB keeps its blended take)

  const corpMargin = resolveMargin(config.corpMargin, varPrice)
  const repMargin = resolveMargin(config.repMargin, varPrice)
  const varMargin = round2(corpMargin + repMargin)

  const customerAmount = isCpo
    ? round2(varPrice + varMargin) // customer charged more
    : round2(varPrice - varMargin) // customer receives less

  return {
    orderType,
    marketValue: round2(marketValue),
    bbPlatformCommission,
    bbProductMargin,
    bbHoldback,
    bbTake,
    varPrice,
    corpMargin,
    repMargin,
    varMargin,
    customerAmount,
  }
}

/**
 * Read a CommissionConfig out of a tenant/settings JSON blob, falling back to
 * defaults. Tolerant of missing/partial config so pricing never crashes.
 */
export function commissionConfigFromSettings(settings: unknown): CommissionConfig {
  const s = (settings ?? {}) as Record<string, unknown>
  const c = (s.commission ?? {}) as Record<string, unknown>
  const margin = (v: unknown, fallback: MarginSpec): MarginSpec => {
    const m = v as Record<string, unknown> | undefined
    if (!m) return fallback
    const type = m.type === 'percent' ? 'percent' : 'fixed'
    const value = typeof m.value === 'number' ? m.value : 0
    return { type, value }
  }
  return {
    platformCommissionPct: typeof c.platformCommissionPct === 'number' ? c.platformCommissionPct : DEFAULT_COMMISSION_CONFIG.platformCommissionPct,
    productMarginPct: typeof c.productMarginPct === 'number' ? c.productMarginPct : DEFAULT_COMMISSION_CONFIG.productMarginPct,
    holdbackPct: typeof c.holdbackPct === 'number' ? c.holdbackPct : DEFAULT_COMMISSION_CONFIG.holdbackPct,
    corpMargin: margin(c.corpMargin, DEFAULT_COMMISSION_CONFIG.corpMargin),
    repMargin: margin(c.repMargin, DEFAULT_COMMISSION_CONFIG.repMargin),
  }
}
