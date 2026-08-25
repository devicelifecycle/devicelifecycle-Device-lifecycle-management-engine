// ============================================================================
// RVE QUOTE ASSEMBLY — shared by the compute and send API routes
// ============================================================================
// Turns request lines into priced residual lines: an explicit baseValue wins;
// otherwise the pricing engine's current trade price becomes the base. Also
// loads the admin-configured annual depreciation rate (pricing_settings
// .cpo_depreciation_rate, edited in Admin > Pricing) so both routes project
// residuals off the same configured curve. Per-line failures are collected,
// never fatal — one unpriceable device must not sink a whole quote.

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PricingService } from '@/services/pricing.service'
import { estimateResidualValue, tableFromAnnualRate, type DepreciationPoint } from './rve'
import type { DeviceCondition } from '@/types'

const round2 = (n: number): number => Math.round(n * 100) / 100

export interface RveLineInput {
  label?: string
  /** Manual override — skips the pricing engine when present. */
  baseValue?: number
  device_id?: string
  storage?: string
  condition?: DeviceCondition
}

export interface PricedRveLine {
  label: string
  baseValue: number
  residualValue: number
}

/**
 * Admin-configured annual depreciation % (0-50); defaults to 15 exactly like
 * the CPO buyback calculator does when the setting is missing or invalid.
 */
export async function loadAnnualDepreciationRate(): Promise<number> {
  const svc = createServiceRoleClient()
  const { data } = await svc
    .from('pricing_settings')
    .select('setting_value')
    .eq('setting_key', 'cpo_depreciation_rate')
    .maybeSingle()
  const v = data?.setting_value != null ? parseFloat(String(data.setting_value)) : NaN
  return Number.isFinite(v) && v >= 0 && v <= 50 ? v : 15
}

/** The effective retention table for RVE projections this deployment uses. */
export async function loadDepreciationTable(): Promise<DepreciationPoint[]> {
  return tableFromAnnualRate(await loadAnnualDepreciationRate())
}

/** Resolve each line's base (manual value or pricing engine) and project its residual. */
export async function resolveQuoteLines(
  lines: RveLineInput[],
  months: number,
  table: DepreciationPoint[],
): Promise<{ priced: PricedRveLine[]; errors: Array<{ index: number; error: string }> }> {
  const svc = createServiceRoleClient()
  const priced: PricedRveLine[] = []
  const errors: Array<{ index: number; error: string }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let base = typeof line.baseValue === 'number' ? line.baseValue : null
    if (base === null) {
      if (!line.device_id) {
        errors.push({ index: i, error: 'Provide a current value or pick a device to price' })
        continue
      }
      try {
        const result = await PricingService.calculateAdaptivePrice(
          {
            device_id: line.device_id,
            storage: line.storage || '128GB',
            carrier: 'Unlocked',
            condition: line.condition ?? 'good',
          },
          svc,
        )
        const tradePrice = result.success ? Number(result.trade_price) || 0 : 0
        if (tradePrice <= 0) {
          errors.push({ index: i, error: result.error || 'No market price available for this device' })
          continue
        }
        base = tradePrice
      } catch {
        errors.push({ index: i, error: 'Pricing lookup failed for this device' })
        continue
      }
    }
    priced.push({
      label: line.label ?? '',
      baseValue: round2(base),
      residualValue: estimateResidualValue(base, months, table),
    })
  }
  return { priced, errors }
}