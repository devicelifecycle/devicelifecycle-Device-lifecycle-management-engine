// ============================================================================
// DATA-DRIVEN PRICING MODEL
// ============================================================================
// Self-learning model that uses trained baselines built from ALL data sources:
// internal orders, IMEI records, sales history, market prices, and competitor
// scraped data. Auto-trains when no baselines exist. Minimal live dependency
// on third-party APIs — the model carries its own intelligence.

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { DeviceCondition } from '@/types'
import type { IPricingModel, PricingModelInput, PricingModelResult } from './types'

const round2 = (n: number) => Math.round(Math.max(n, 0) * 100) / 100

const CRITICAL_ISSUES = ['SCREEN_DEAD', 'ICLOUD_LOCKED', 'WATER_DAMAGE', 'BATTERY_DEAD']

const DEFAULT_DEDUCTIONS: Record<string, { type: 'percentage' | 'fixed'; value: number }> = {
  SCREEN_CRACK: { type: 'percentage', value: 15 },
  SCREEN_DEAD: { type: 'percentage', value: 40 },
  BATTERY_POOR: { type: 'fixed', value: 30 },
  BATTERY_DEAD: { type: 'fixed', value: 50 },
  ICLOUD_LOCKED: { type: 'percentage', value: 90 },
  CARRIER_LOCKED: { type: 'fixed', value: 50 },
  WATER_DAMAGE: { type: 'percentage', value: 35 },
  CAMERA_BROKEN: { type: 'percentage', value: 20 },
  SPEAKER_BROKEN: { type: 'fixed', value: 25 },
  BUTTON_BROKEN: { type: 'fixed', value: 20 },
}

const DEFAULT_CONDITION_MULTIPLIERS: Record<string, number> = {
  new: 1.0,
  excellent: 0.95,
  good: 0.85,
  fair: 0.70,
  poor: 0.50,
}

let lastTrainCheck = 0
const TRAIN_CHECK_INTERVAL_MS = 5 * 60 * 1000 // Don't re-check more than every 5 min

export class DataDrivenPricingModel implements IPricingModel {
  readonly id = 'data_driven'
  readonly name = 'Data-Driven (Self-Learning)'
  readonly description =
    'Self-learning model trained from ALL sources: orders, IMEI, sales, market prices, competitor scrapes. Auto-trains when needed.'

  async calculate(input: PricingModelInput): Promise<PricingModelResult> {
    const supabase = createServerSupabaseClient()
    const storage = input.storage || '128GB'
    const carrier = input.carrier || 'Unlocked'

    // Auto-train if baselines are empty or stale (check at most every 5 min)
    await this.ensureBaselinesExist(supabase)

    let anchorPrice = 0
    let source: 'trained' | 'trained_good_fallback' | 'trained_nearby' | 'market_fallback' | 'pricing_table' = 'trained'
    let sampleCount = 0
    let dataSources: string[] = []
    let confidenceBonus = 0

    // 1. Try exact trained baseline (device, storage, carrier, condition)
    const { data: baseline } = await supabase
      .from('trained_pricing_baselines')
      .select('median_trade_price, p25_trade_price, p75_trade_price, sample_count, data_sources, last_trained_at')
      .eq('device_id', input.device_id)
      .eq('storage', storage)
      .eq('carrier', carrier)
      .eq('condition', input.condition)
      .limit(1)
      .single()

    if (baseline?.median_trade_price != null && baseline.median_trade_price > 0) {
      anchorPrice = baseline.median_trade_price
      sampleCount = baseline.sample_count ?? 0
      dataSources = (baseline.data_sources as string[]) || []
      source = 'trained'

      // Higher confidence when trained from multiple diverse sources
      const uniqueSources = new Set(dataSources.map(s => s.split(':')[0]))
      if (uniqueSources.size >= 3) confidenceBonus = 0.1
      else if (uniqueSources.size >= 2) confidenceBonus = 0.05
    }

    // 2. Fallback: trained "good" baseline * learned condition multiplier
    if (!anchorPrice) {
      const { data: goodBaseline } = await supabase
        .from('trained_pricing_baselines')
        .select('median_trade_price, sample_count, data_sources')
        .eq('device_id', input.device_id)
        .eq('storage', storage)
        .eq('carrier', carrier)
        .eq('condition', 'good')
        .limit(1)
        .single()

      if (goodBaseline?.median_trade_price != null && goodBaseline.median_trade_price > 0) {
        const mult = await this.getConditionMultiplier(supabase, input.condition)
        anchorPrice = goodBaseline.median_trade_price * mult
        sampleCount = goodBaseline.sample_count ?? 0
        dataSources = (goodBaseline.data_sources as string[]) || []
        source = 'trained_good_fallback'
      }
    }

    // 3. Fallback: try any storage variant for same device
    if (!anchorPrice) {
      const { data: anyBaseline } = await supabase
        .from('trained_pricing_baselines')
        .select('median_trade_price, storage, sample_count, data_sources')
        .eq('device_id', input.device_id)
        .eq('carrier', carrier)
        .eq('condition', input.condition)
        .order('sample_count', { ascending: false })
        .limit(1)
        .single()

      if (anyBaseline?.median_trade_price != null && anyBaseline.median_trade_price > 0) {
        anchorPrice = anyBaseline.median_trade_price
        sampleCount = anyBaseline.sample_count ?? 0
        dataSources = (anyBaseline.data_sources as string[]) || []
        source = 'trained_nearby'
      }
    }

    // 4. Last resort: live market lookup (but we should rarely hit this after training)
    if (!anchorPrice) {
      const { data: mp } = await supabase
        .from('market_prices')
        .select('wholesale_c_stock')
        .eq('device_id', input.device_id)
        .eq('storage', storage)
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()

      if (mp?.wholesale_c_stock && Number(mp.wholesale_c_stock) > 0) {
        const condMult = DEFAULT_CONDITION_MULTIPLIERS[input.condition] ?? 0.85
        anchorPrice = Number(mp.wholesale_c_stock) * condMult
        source = 'market_fallback'
      }
    }

    if (!anchorPrice) {
      const { data: pt } = await supabase
        .from('pricing_tables')
        .select('base_price')
        .eq('device_id', input.device_id)
        .eq('condition', 'new')
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()

      if (pt?.base_price && Number(pt.base_price) > 0) {
        const condMult = DEFAULT_CONDITION_MULTIPLIERS[input.condition] ?? 0.85
        anchorPrice = Number(pt.base_price) * condMult
        source = 'pricing_table'
      }
    }

    if (!anchorPrice || anchorPrice <= 0) {
      return {
        success: false,
        final_price: 0,
        confidence: 0,
        price_date: new Date().toISOString(),
        valid_for_hours: 0,
        breakdown: {},
        error: 'No pricing data available. Run training or add market/competitor data first.',
      }
    }

    let price = anchorPrice

    // Apply issue deductions
    const issuesApplied: string[] = []
    let totalDeductions = 0
    const deductionKeys = (input.issues || []).map(i => i.toUpperCase().replace(/\s/g, '_'))
    const isBroken = input.condition === 'poor' || deductionKeys.some(k => CRITICAL_ISSUES.includes(k))

    if (isBroken) {
      const goodPrice = await this.getGoodPrice(supabase, input.device_id, storage, carrier)
      price = (goodPrice > 0 ? goodPrice : anchorPrice) * 0.5
      totalDeductions = (goodPrice > 0 ? goodPrice : anchorPrice) - price
      issuesApplied.push('broken_50pct_rule')
    } else {
      for (const issue of deductionKeys) {
        const d = DEFAULT_DEDUCTIONS[issue]
        if (d) {
          issuesApplied.push(issue)
          if (d.type === 'percentage') {
            const amt = price * (d.value / 100)
            totalDeductions += amt
            price -= amt
          } else {
            totalDeductions += d.value
            price -= d.value
          }
        }
      }
    }
    price = Math.max(price, 0)

    const qty = input.quantity ?? 1
    const finalPrice = round2(price * qty)

    // Confidence scoring based on source quality and sample count
    let confidence: number
    switch (source) {
      case 'trained':
        confidence = Math.min(0.95, 0.75 + Math.min(sampleCount, 50) / 200 + confidenceBonus)
        break
      case 'trained_good_fallback':
        confidence = Math.min(0.90, 0.70 + Math.min(sampleCount, 50) / 250 + confidenceBonus)
        break
      case 'trained_nearby':
        confidence = 0.65 + confidenceBonus
        break
      case 'market_fallback':
        confidence = 0.55
        break
      case 'pricing_table':
        confidence = 0.45
        break
      default:
        confidence = 0.5
    }

    return {
      success: true,
      final_price: finalPrice,
      trade_price: input.purpose === 'sell' ? undefined : finalPrice,
      cpo_price: input.purpose === 'sell' ? finalPrice : undefined,
      confidence,
      price_date: new Date().toISOString(),
      valid_for_hours: source === 'trained' || source === 'trained_good_fallback' ? 24 : 12,
      breakdown: {
        anchor_price: anchorPrice,
        source,
        sample_count: sampleCount,
        data_sources: dataSources,
        condition: input.condition,
        issues_applied: issuesApplied,
        deductions: round2(totalDeductions),
        is_broken: isBroken,
        purpose: input.purpose ?? 'buy',
        quantity: qty,
        final_price: finalPrice,
        self_learned: source === 'trained' || source === 'trained_good_fallback' || source === 'trained_nearby',
      },
    }
  }

  private async getConditionMultiplier(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    condition: string
  ): Promise<number> {
    const { data: multRow } = await supabase
      .from('trained_condition_multipliers')
      .select('multiplier')
      .eq('condition', condition)
      .limit(1)
      .single()
    return multRow?.multiplier ? Number(multRow.multiplier) : (DEFAULT_CONDITION_MULTIPLIERS[condition] ?? 0.85)
  }

  private async getGoodPrice(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    deviceId: string,
    storage: string,
    carrier: string
  ): Promise<number> {
    const { data } = await supabase
      .from('trained_pricing_baselines')
      .select('median_trade_price')
      .eq('device_id', deviceId)
      .eq('storage', storage)
      .eq('carrier', carrier)
      .eq('condition', 'good')
      .limit(1)
      .single()
    return data?.median_trade_price ? Number(data.median_trade_price) : 0
  }

  /**
   * Auto-train if no baselines exist. This means the model bootstraps
   * itself from whatever data is available (market + competitor + internal).
   */
  private async ensureBaselinesExist(supabase: ReturnType<typeof createServerSupabaseClient>): Promise<void> {
    if (Date.now() - lastTrainCheck < TRAIN_CHECK_INTERVAL_MS) return
    lastTrainCheck = Date.now()

    try {
      const { data: existing } = await supabase
        .from('trained_pricing_baselines')
        .select('id')
        .limit(1)

      if (!existing?.length) {
        console.log('[DataDrivenModel] No baselines found — auto-training from all available data...')
        const { PricingTrainingService } = await import('@/services/pricing-training.service')
        const result = await PricingTrainingService.train()
        console.log(`[DataDrivenModel] Auto-trained: ${result.baselines_upserted} baselines from ${JSON.stringify(result.sample_counts)}`)
      }
    } catch (e) {
      console.warn('[DataDrivenModel] Auto-train check failed:', e instanceof Error ? e.message : e)
    }

  }
}
