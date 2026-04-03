// ============================================================================
// COMPETITOR BEAT PRICING MODEL
// ============================================================================
// Self-contained logic: beat highest competitor by X%.
// Fetches competitor data but applies its own formula (no market_prices).
// Use for price-sensitive segments where being competitive is key.

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { DeviceCondition } from '@/types'
import type { IPricingModel, PricingModelInput, PricingModelResult } from './types'

const round2 = (n: number) => Math.round(Math.max(n, 0) * 100) / 100

const CONDITION_MULT: Record<DeviceCondition, number> = {
  new: 1.0,
  excellent: 0.9,
  good: 0.78,
  fair: 0.62,
  poor: 0.4,
}

export interface CompetitorBeatConfig {
  /** Beat highest competitor by this % (e.g. 5 = beat by 5%) */
  beat_percent: number
  /** Minimum price floor (don't go below) */
  min_floor_percent_of_competitor: number
}

const DEFAULT_CONFIG: CompetitorBeatConfig = {
  beat_percent: 5,
  min_floor_percent_of_competitor: 0.85,
}

export class CompetitorBeatPricingModel implements IPricingModel {
  readonly id = 'competitor_beat'
  readonly name = 'Competitor Beat'
  readonly description = 'Beat highest competitor by X%. Competitive, price-sensitive segments.'

  constructor(private config: Partial<CompetitorBeatConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async calculate(input: PricingModelInput): Promise<PricingModelResult> {
    const cfg = this.config as CompetitorBeatConfig
    const supabase = await createServerSupabaseClient()

    const storage = input.storage || '128GB'
    const carrier = input.carrier || 'Unlocked'

    // Fetch competitor trade-in prices (exclude Bell — scraper disabled)
    const { data: competitors } = await supabase
      .from('competitor_prices')
      .select('competitor_name, trade_in_price')
      .eq('device_id', input.device_id)
      .eq('storage', storage)
      .neq('competitor_name', 'Bell')
      .not('trade_in_price', 'is', null)

    let anchorPrice = input.base_price ?? 0
    let highestCompetitor = 0
    const competitorList: Array<{ name: string; price: number }> = []
    const { normalizeCompetitorName } = await import('@/lib/utils')

    if (competitors?.length) {
      const byName = new Map<string, number>()
      for (const c of competitors) {
        const p = Number(c.trade_in_price) || 0
        if (p > 0) {
          const name = normalizeCompetitorName(c.competitor_name)
          if (!byName.has(name)) byName.set(name, p)
          if (p > highestCompetitor) highestCompetitor = p
        }
      }
      for (const [name, price] of byName) competitorList.push({ name, price })
    }

    // If no base_price and no competitors, fail
    if (!anchorPrice && !highestCompetitor) {
      return {
        success: false,
        final_price: 0,
        confidence: 0,
        price_date: new Date().toISOString(),
        valid_for_hours: 0,
        breakdown: {},
        error: 'No base_price or competitor data. This model requires at least one.',
      }
    }

    // Anchor: use base_price if provided, else derive from competitor
    if (!anchorPrice && highestCompetitor > 0) {
      anchorPrice = highestCompetitor / (1 - cfg.beat_percent / 100)
    }

    // Apply condition
    const mult = CONDITION_MULT[input.condition] ?? 0.7
    let price = anchorPrice * mult

    // Simple issue deductions (percentage only for key issues)
    for (const issue of input.issues || []) {
      if (['ICLOUD_LOCKED', 'SCREEN_DEAD'].includes(issue.toUpperCase().replace(/\s/g, '_'))) {
        price *= 0.1 // 90% off for critical locks
      }
    }
    price = Math.max(price, 0)

    // Model logic: beat competitor by beat_percent — offer at least beatTarget (competitor * (1 + beat%))
    let tradePrice = price
    if (highestCompetitor > 0) {
      const beatTarget = highestCompetitor * (1 + cfg.beat_percent / 100)
      const floor = highestCompetitor * cfg.min_floor_percent_of_competitor
      tradePrice = Math.max(floor, beatTarget, price)
    }

    const qty = input.quantity ?? 1
    const finalPrice = round2(tradePrice * qty)

    return {
      success: true,
      final_price: finalPrice,
      trade_price: finalPrice,
      confidence: competitorList.length >= 2 ? 0.9 : 0.7,
      price_date: new Date().toISOString(),
      valid_for_hours: 12,
      breakdown: {
        anchor_price: anchorPrice,
        condition: input.condition,
        condition_multiplier: mult,
        after_condition: round2(anchorPrice * mult),
        competitors_found: competitorList.length,
        highest_competitor: highestCompetitor,
        beat_target_percent: cfg.beat_percent,
        trade_price: round2(tradePrice),
        quantity: qty,
        final_price: finalPrice,
      },
    }
  }
}
