// ============================================================================
// COMPETITOR BEAT PRICING MODEL
// ============================================================================
// Uses market reference average (Bell + Telus + GoRecell Good × 2) / 4 as the
// trade-in anchor when the device is in the benchmark table. For unknown devices,
// falls back to the plain average of available competitor prices.
// "Beat competitor" mode is kept as an opt-in config (not the default).

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { DeviceCondition } from '@/types'
import type { IPricingModel, PricingModelInput, PricingModelResult } from './types'
import { getMarketRefEntry } from '@/lib/constants'

const round2 = (n: number) => Math.round(Math.max(n, 0) * 100) / 100

const CONDITION_MULT: Record<DeviceCondition, number> = {
  new: 1.0,
  excellent: 0.95,
  good: 0.85,
  fair: 0.70,
  poor: 0.50,
}

export interface CompetitorBeatConfig {
  /** When true, add beat_percent above the anchor. Default false — use anchor as-is. */
  beat_enabled: boolean
  /** Beat anchor by this % when beat_enabled (e.g. 5 = beat by 5%) */
  beat_percent: number
  /** Minimum price floor (% of highest competitor) */
  min_floor_percent_of_competitor: number
}

const DEFAULT_CONFIG: CompetitorBeatConfig = {
  beat_enabled: false,   // off by default — use market ref avg as-is
  beat_percent: 5,
  min_floor_percent_of_competitor: 0.85,
}

export class CompetitorBeatPricingModel implements IPricingModel {
  readonly id = 'competitor_beat'
  readonly name = 'Competitor Beat'
  readonly description = 'Anchors to market reference avg (Bell/Telus/GoRecell benchmark). Beat mode is opt-in.'

  constructor(private config: Partial<CompetitorBeatConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async calculate(input: PricingModelInput): Promise<PricingModelResult> {
    const cfg = this.config as CompetitorBeatConfig
    const supabase = await createServerSupabaseClient()

    const storage = input.storage || '128GB'

    // Fetch competitor trade-in prices for fallback / floor reference
    const { data: competitors } = await supabase
      .from('competitor_prices')
      .select('competitor_name, trade_in_price')
      .eq('device_id', input.device_id)
      .eq('storage', storage)
      .not('trade_in_price', 'is', null)

    const competitorList: Array<{ name: string; price: number }> = []
    let avgCompetitorPrice = 0
    let highestCompetitor = 0

    if (competitors?.length) {
      const byName = new Map<string, number>()
      for (const c of competitors) {
        const p = Number(c.trade_in_price) || 0
        if (p > 0) {
          const name = c.competitor_name || 'Unknown'
          if (!byName.has(name)) byName.set(name, p)
          if (p > highestCompetitor) highestCompetitor = p
        }
      }
      for (const [name, price] of byName) competitorList.push({ name, price })
      avgCompetitorPrice = byName.size > 0
        ? Array.from(byName.values()).reduce((s, p) => s + p, 0) / byName.size
        : 0
    }

    // Resolve device label for market ref lookup
    const { data: deviceInfo } = await supabase
      .from('device_catalog')
      .select('make, model')
      .eq('id', input.device_id)
      .single()

    const deviceLabel = deviceInfo ? `${deviceInfo.make} ${deviceInfo.model}` : ''
    const refEntry = deviceLabel ? getMarketRefEntry(deviceLabel) : null

    // Anchor: market ref avg scaled for condition, or plain competitor avg for unknown devices
    const goodMult = CONDITION_MULT['good']
    const condMult = CONDITION_MULT[input.condition] ?? goodMult
    let anchorPrice: number
    let anchorSource: string

    if (refEntry) {
      // Known device: use (Bell + Telus + GoRecell Good × 2) / 4, scaled for condition
      anchorPrice = round2((refEntry.avg / goodMult) * condMult)
      anchorSource = `market_ref_benchmark (avg $${refEntry.avg} at Good, scaled to ${input.condition})`
    } else if (avgCompetitorPrice > 0) {
      // Unknown device: plain average of all scraped competitors
      anchorPrice = round2(avgCompetitorPrice)
      anchorSource = `competitor_average (${competitorList.length} competitors)`
    } else if (input.base_price && input.base_price > 0) {
      anchorPrice = round2(input.base_price * condMult)
      anchorSource = 'base_price_with_condition_mult'
    } else {
      return {
        success: false,
        final_price: 0,
        confidence: 0,
        price_date: new Date().toISOString(),
        valid_for_hours: 0,
        breakdown: {},
        error: 'No market reference, competitor data, or base_price available.',
      }
    }

    // Apply issue deductions
    for (const issue of input.issues || []) {
      if (['ICLOUD_LOCKED', 'SCREEN_DEAD'].includes(issue.toUpperCase().replace(/\s/g, '_'))) {
        anchorPrice = round2(anchorPrice * 0.1)
      }
    }
    anchorPrice = Math.max(anchorPrice, 0)

    // Optionally beat: only when explicitly enabled
    let tradePrice = anchorPrice
    if (cfg.beat_enabled && cfg.beat_percent > 0) {
      tradePrice = round2(anchorPrice * (1 + cfg.beat_percent / 100))
    }

    // Never go below the floor (85% of highest competitor, or the anchor itself)
    if (highestCompetitor > 0) {
      const floor = highestCompetitor * cfg.min_floor_percent_of_competitor
      tradePrice = Math.max(tradePrice, floor)
    }

    const qty = input.quantity ?? 1
    const finalPrice = round2(tradePrice * qty)

    return {
      success: true,
      final_price: finalPrice,
      trade_price: finalPrice,
      confidence: refEntry ? 0.95 : competitorList.length >= 2 ? 0.9 : 0.7,
      price_date: new Date().toISOString(),
      valid_for_hours: 12,
      breakdown: {
        anchor_source: anchorSource,
        anchor_price: anchorPrice,
        condition: input.condition,
        condition_multiplier: condMult,
        beat_enabled: cfg.beat_enabled,
        beat_percent: cfg.beat_percent,
        competitors_found: competitorList.length,
        highest_competitor: highestCompetitor,
        avg_competitor: round2(avgCompetitorPrice),
        trade_price: round2(tradePrice),
        quantity: qty,
        final_price: finalPrice,
        ...(refEntry && {
          ref_bell: refEntry.bell,
          ref_telus: refEntry.telus,
          ref_gorecell_good: refEntry.goRecellGood,
          ref_avg: refEntry.avg,
        }),
      },
    }
  }
}
