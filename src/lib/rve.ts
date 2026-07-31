// ============================================================================
// RESIDUAL VALUE ESTIMATE (RVE)
// ============================================================================
// The outline: "RVE follows the same process as Trade-In but based on a future
// value depreciation table estimate." Given a base value and a horizon in
// months, project the device's residual value off a depreciation curve, then
// run it through the normal trade-in pricing.

import { computeDealPricing, type CommissionConfig, type CommissionResult } from './commission'

const round2 = (n: number) => Math.round(n * 100) / 100
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** A depreciation point: fraction of base value retained at `months` of age. */
export interface DepreciationPoint {
  months: number
  retention: number // 0..1
}

/**
 * Default retention curve (fraction of value kept vs. age in months). Steep
 * early, flattening later — typical consumer-device depreciation. Overridable
 * per device class via the BB Admin depreciation table.
 */
export const DEFAULT_DEPRECIATION: DepreciationPoint[] = [
  { months: 0, retention: 1.0 },
  { months: 6, retention: 0.82 },
  { months: 12, retention: 0.68 },
  { months: 18, retention: 0.56 },
  { months: 24, retention: 0.46 },
  { months: 36, retention: 0.3 },
  { months: 48, retention: 0.2 },
  { months: 60, retention: 0.12 },
]

/**
 * Retention fraction at `months`, linearly interpolated between table points.
 * Clamps before the first point and after the last. Table is sorted defensively.
 */
export function residualRetention(months: number, table: DepreciationPoint[] = DEFAULT_DEPRECIATION): number {
  if (table.length === 0) return 1
  const pts = [...table].sort((a, b) => a.months - b.months)
  const m = Math.max(0, months)

  if (m <= pts[0].months) return clamp(pts[0].retention, 0, 1)
  const last = pts[pts.length - 1]
  if (m >= last.months) return clamp(last.retention, 0, 1)

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (m >= a.months && m <= b.months) {
      const span = b.months - a.months
      const t = span === 0 ? 0 : (m - a.months) / span
      return clamp(a.retention + t * (b.retention - a.retention), 0, 1)
    }
  }
  return clamp(last.retention, 0, 1)
}

/** Project a residual value from a base value + horizon in months. */
export function estimateResidualValue(
  baseValue: number,
  months: number,
  table: DepreciationPoint[] = DEFAULT_DEPRECIATION,
): number {
  return round2(Math.max(0, baseValue) * residualRetention(months, table))
}

export interface RveResult {
  baseValue: number
  months: number
  retention: number
  residualValue: number
  /** Trade-in pricing computed against the residual value. */
  pricing: CommissionResult
}

/** Full RVE quote: depreciate the base value, then price it as a trade-in. */
export function computeRve(input: {
  baseValue: number
  months: number
  config: CommissionConfig
  table?: DepreciationPoint[]
}): RveResult {
  const table = input.table ?? DEFAULT_DEPRECIATION
  const retention = residualRetention(input.months, table)
  const residualValue = estimateResidualValue(input.baseValue, input.months, table)
  return {
    baseValue: round2(Math.max(0, input.baseValue)),
    months: Math.max(0, input.months),
    retention: round2(retention),
    residualValue,
    pricing: computeDealPricing({ orderType: 'trade_in', marketValue: residualValue, config: input.config }),
  }
}
