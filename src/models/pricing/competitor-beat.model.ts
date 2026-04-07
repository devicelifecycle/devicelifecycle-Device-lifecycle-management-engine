// ============================================================================
// COMPETITOR BEAT PRICING MODEL
// ============================================================================
// Weighted average of ALL available competitors — GoRecell Good gets weight ×2
// (most liquid refurbished market signal). Every other competitor = weight ×1.
// Applies dynamically to every device in the catalog. No hardcoded device list.

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { DeviceCondition } from '@/types'
import type { IPricingModel, PricingModelInput, PricingModelResult } from './types'

const round2 = (n: number) => Math.round(Math.max(n, 0) * 100) / 100

const CONDITION_MULT: Record<DeviceCondition, number> = {
  new: 1.0,
  excellent: 0.95,
  good: 0.85,
  fair: 0.70,
  poor: 0.50,
}

export interface CompetitorBeatConfig {
  /** When true, add beat_percent above the weighted avg. Default false. */
  beat_enabled: boolean
  beat_percent: number
  min_floor_percent_of_competitor: number
}

const DEFAULT_CONFIG: CompetitorBeatConfig = {
  beat_enabled: false,
  beat_percent: 5,
  min_floor_percent_of_competitor: 0.85,
}

export class CompetitorBeatPricingModel implements IPricingModel {
  readonly id = 'competitor_beat'
  readonly name = 'Competitor Beat'
  readonly description =
    'Weighted avg of all competitors (GoRecell Good ×2). Beat mode opt-in.'

  constructor(private config: Partial<CompetitorBeatConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async calculate(input: PricingModelInput): Promise<PricingModelResult> {
    const cfg = this.config as CompetitorBeatConfig
    const supabase = await createServerSupabaseClient()

    const storage = input.storage || '128GB'

    // Map condition to competitor condition string
    const competitorCondition =
      input.condition === 'new' || input.condition === 'excellent' ? 'excellent'
      : input.condition === 'fair' ? 'fair'
      : input.condition === 'poor' ? 'broken'
      : 'good'

    // Fetch ALL conditions for this device+storage — not just exact match.
    // This ensures every competitor contributes regardless of which condition
    // rows they happen to have scraped. Deduplicate below: prefer exact match.
    const { data: allRows } = await supabase
      .from('competitor_prices')
      .select('competitor_name, trade_in_price, condition, scraped_at, created_at')
      .eq('device_id', input.device_id)
      .eq('storage', storage)
      .not('trade_in_price', 'is', null)
      .gt('trade_in_price', 0)

    // Deduplicate: one row per competitor, prefer exact condition match then freshest
    const byName = new Map<string, { price: number; condition: string }>()
    let highestCompetitor = 0

    for (const c of allRows || []) {
      const p = Number(c.trade_in_price) || 0
      if (p <= 0) continue
      const name = (c.competitor_name || 'Unknown').trim()
      const existing = byName.get(name)
      if (!existing) {
        byName.set(name, { price: p, condition: c.condition || 'good' })
      } else {
        const existingIsExact = existing.condition === competitorCondition
        const currentIsExact = (c.condition || '') === competitorCondition
        if (currentIsExact && !existingIsExact) {
          byName.set(name, { price: p, condition: c.condition || 'good' })
        } else if (currentIsExact === existingIsExact) {
          const existingTs = new Date((c.scraped_at || c.created_at) ?? 0).getTime()
          const currentTs = new Date((c.scraped_at || c.created_at) ?? 0).getTime()
          if (currentTs > existingTs) byName.set(name, { price: p, condition: c.condition || 'good' })
        }
      }
      if (p > highestCompetitor) highestCompetitor = p
    }

    if (byName.size === 0 && !(input.base_price && input.base_price > 0)) {
      return {
        success: false,
        final_price: 0,
        confidence: 0,
        price_date: new Date().toISOString(),
        valid_for_hours: 0,
        breakdown: {},
        error: 'No competitor data available for this device.',
      }
    }

    // Two-step formula:
    // Step 1: carrier_avg = average of all non-GoRecell competitors
    // Step 2: final = (carrier_avg + GoRecell_Good) / 2
    const isGoRecell = (name: string) => {
      const n = name.toLowerCase()
      return n.includes('gorecell') || n.includes('go recell') || n.includes('goresell')
    }
    let goRecellGoodPrice = 0
    const carrierPrices: number[] = []
    for (const [name, entry] of byName) {
      if (isGoRecell(name)) {
        goRecellGoodPrice = entry.price
      } else {
        carrierPrices.push(entry.price)
      }
    }
    const carrierAvg = carrierPrices.length > 0
      ? carrierPrices.reduce((s, p) => s + p, 0) / carrierPrices.length
      : 0
    const weightedAvg = carrierAvg > 0 && goRecellGoodPrice > 0
      ? (carrierAvg + goRecellGoodPrice) / 2
      : goRecellGoodPrice > 0
        ? goRecellGoodPrice
        : carrierAvg

    // Apply issue deductions
    let anchorPrice = round2(weightedAvg > 0 ? weightedAvg : (input.base_price ?? 0) * (CONDITION_MULT[input.condition] ?? 0.85))
    for (const issue of input.issues || []) {
      if (['ICLOUD_LOCKED', 'SCREEN_DEAD'].includes(issue.toUpperCase().replace(/\s/g, '_'))) {
        anchorPrice = round2(anchorPrice * 0.1)
      }
    }
    anchorPrice = Math.max(anchorPrice, 0)

    // Optionally beat
    let tradePrice = anchorPrice
    if (cfg.beat_enabled && cfg.beat_percent > 0) {
      tradePrice = round2(anchorPrice * (1 + cfg.beat_percent / 100))
    }

    // Floor: never below 85% of highest competitor
    if (highestCompetitor > 0) {
      tradePrice = Math.max(tradePrice, highestCompetitor * cfg.min_floor_percent_of_competitor)
    }

    const qty = input.quantity ?? 1
    const finalPrice = round2(tradePrice * qty)

    return {
      success: true,
      final_price: finalPrice,
      trade_price: finalPrice,
      confidence: byName.size >= 3 ? 0.95 : byName.size >= 2 ? 0.9 : 0.75,
      price_date: new Date().toISOString(),
      valid_for_hours: 12,
      breakdown: {
        competitors_found: byName.size,
        carrier_competitors: carrierPrices.length,
        carrier_names: Array.from(byName.entries()).filter(([n]) => !isGoRecell(n)).map(([n]) => n).join(', '),
        carrier_avg: round2(carrierAvg),
        gorecell_good_price: goRecellGoodPrice,
        formula: carrierAvg > 0 && goRecellGoodPrice > 0
          ? `(carrier_avg $${round2(carrierAvg)} + GoRecell $${goRecellGoodPrice}) / 2`
          : goRecellGoodPrice > 0 ? 'GoRecell only' : 'Carrier avg only',
        weighted_avg: round2(weightedAvg),
        highest_competitor: highestCompetitor,
        beat_enabled: cfg.beat_enabled,
        trade_price: round2(tradePrice),
        quantity: qty,
        final_price: finalPrice,
      },
    }
  }
}
