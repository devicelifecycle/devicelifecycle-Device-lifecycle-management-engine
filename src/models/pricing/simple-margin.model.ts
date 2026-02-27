// ============================================================================
// SIMPLE MARGIN PRICING MODEL
// ============================================================================
// Self-contained pricing logic: condition multiplier + fixed margin.
// No dependency on market_prices or competitor data.
// Use for devices/categories that need straightforward, predictable pricing.

import type { DeviceCondition } from '@/types'
import type { IPricingModel, PricingModelInput, PricingModelResult, FixedMarginConfig } from './types'

const round2 = (n: number) => Math.round(Math.max(n, 0) * 100) / 100

const DEFAULT_CONFIG: FixedMarginConfig = {
  condition_multipliers: {
    new: 1.0,
    excellent: 0.92,
    good: 0.82,
    fair: 0.65,
    poor: 0.45,
  },
  trade_in_margin_percent: 22,
  cpo_markup_percent: 28,
  fixed_costs_per_unit: 12,
}

/** Simple deductions: issue_code -> { type, value } */
const SIMPLE_DEDUCTIONS: Record<string, { type: 'percentage' | 'fixed'; value: number }> = {
  SCREEN_CRACK: { type: 'percentage', value: 15 },
  SCREEN_DEAD: { type: 'percentage', value: 40 },
  BATTERY_POOR: { type: 'fixed', value: 30 },
  ICLOUD_LOCKED: { type: 'percentage', value: 90 },
  CARRIER_LOCKED: { type: 'fixed', value: 50 },
  WATER_DAMAGE: { type: 'percentage', value: 35 },
}

export class SimpleMarginPricingModel implements IPricingModel {
  readonly id = 'simple_margin'
  readonly name = 'Simple Margin'
  readonly description = 'Fixed condition multipliers + margin. No market data. Predictable pricing.'

  constructor(private config: Partial<FixedMarginConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  calculate(input: PricingModelInput): PricingModelResult {
    const cfg = this.config as FixedMarginConfig
    const basePrice = input.base_price ?? 0

    if (!basePrice || basePrice <= 0) {
      return {
        success: false,
        final_price: 0,
        confidence: 0,
        price_date: new Date().toISOString(),
        valid_for_hours: 0,
        breakdown: {},
        error: 'base_price is required and must be positive',
      }
    }

    // Step 1: Apply condition
    const mult = cfg.condition_multipliers[input.condition] ?? 0.7
    let price = basePrice * mult

    // Step 2: Apply issue deductions
    const issuesApplied: string[] = []
    let totalDeductions = 0
    for (const issue of input.issues || []) {
      const d = SIMPLE_DEDUCTIONS[issue] ?? SIMPLE_DEDUCTIONS[issue.toUpperCase().replace(/\s/g, '_')]
      if (d) {
        issuesApplied.push(issue)
        if (d.type === 'percentage') {
          totalDeductions += price * (d.value / 100)
          price *= 1 - d.value / 100
        } else {
          totalDeductions += d.value
          price -= d.value
        }
      }
    }
    price = Math.max(price, 0)

    // Step 3: Apply purpose-specific logic
    const qty = input.quantity ?? 1
    let finalPrice: number

    if (input.purpose === 'buy') {
      // Trade-in: subtract costs and margin from adjusted price
      const costs = cfg.fixed_costs_per_unit
      const marginTarget = price * (cfg.trade_in_margin_percent / 100)
      finalPrice = (price - costs - marginTarget) * qty
    } else {
      // CPO/sell: add markup
      finalPrice = price * (1 + cfg.cpo_markup_percent / 100) * qty
    }

    finalPrice = round2(Math.max(finalPrice, 0))

    return {
      success: true,
      final_price: finalPrice,
      trade_price: input.purpose === 'buy' ? finalPrice : undefined,
      cpo_price: input.purpose === 'sell' ? finalPrice : undefined,
      confidence: 0.85,
      price_date: new Date().toISOString(),
      valid_for_hours: 24,
      breakdown: {
        base_price: basePrice,
        condition: input.condition,
        condition_multiplier: mult,
        after_condition: round2(basePrice * mult),
        issues_applied: issuesApplied,
        deductions: round2(totalDeductions),
        after_deductions: round2(price),
        purpose: input.purpose ?? 'buy',
        margin_or_markup: input.purpose === 'buy'
          ? `${cfg.trade_in_margin_percent}% margin + $${cfg.fixed_costs_per_unit} costs`
          : `${cfg.cpo_markup_percent}% markup`,
        quantity: qty,
        final_price: finalPrice,
      },
    }
  }
}
