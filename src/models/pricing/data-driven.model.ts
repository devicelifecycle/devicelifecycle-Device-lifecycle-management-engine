// ============================================================================
// DATA-DRIVEN PRICING MODEL
// ============================================================================
// Uses our own trained baselines (from order_items, imei_records, sales_history).
// Minimal dependency on competitors or market_prices. Use internal data first.

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { DeviceCondition } from '@/types'
import type { IPricingModel, PricingModelInput, PricingModelResult } from './types'

const round2 = (n: number) => Math.round(Math.max(n, 0) * 100) / 100

/** Critical issues -> 50% of good (Brian's rule) */
const CRITICAL_ISSUES = ['SCREEN_DEAD', 'ICLOUD_LOCKED', 'WATER_DAMAGE', 'BATTERY_DEAD']

const DEFAULT_DEDUCTIONS: Record<string, { type: 'percentage' | 'fixed'; value: number }> = {
  SCREEN_CRACK: { type: 'percentage', value: 15 },
  SCREEN_DEAD: { type: 'percentage', value: 40 },
  BATTERY_POOR: { type: 'fixed', value: 30 },
  BATTERY_DEAD: { type: 'fixed', value: 50 },
  ICLOUD_LOCKED: { type: 'percentage', value: 90 },
  CARRIER_LOCKED: { type: 'fixed', value: 50 },
  WATER_DAMAGE: { type: 'percentage', value: 35 },
}

export class DataDrivenPricingModel implements IPricingModel {
  readonly id = 'data_driven'
  readonly name = 'Data-Driven (Trained)'
  readonly description =
    'Uses our own historical data (orders, IMEI, sales). Minimal third-party dependency. Train via pricing-training cron.'

  async calculate(input: PricingModelInput): Promise<PricingModelResult> {
    const supabase = createServerSupabaseClient()
    const storage = input.storage || '128GB'
    const carrier = input.carrier || 'Unlocked'

    let anchorPrice = 0
    let source: 'trained' | 'trained_good_fallback' | 'market' | 'pricing_table' = 'trained'
    let sampleCount = 0

    // 1. Try trained baseline for exact (device, storage, condition)
    const { data: baseline } = await supabase
      .from('trained_pricing_baselines')
      .select('median_trade_price, sample_count')
      .eq('device_id', input.device_id)
      .eq('storage', storage)
      .eq('carrier', carrier)
      .eq('condition', input.condition)
      .limit(1)
      .single()

    if (baseline?.median_trade_price != null && baseline.median_trade_price > 0) {
      anchorPrice = baseline.median_trade_price
      sampleCount = baseline.sample_count ?? 0
      source = 'trained'
    }

    // 2. Fallback: trained "good" baseline * condition multiplier
    if (!anchorPrice) {
      const { data: goodBaseline } = await supabase
        .from('trained_pricing_baselines')
        .select('median_trade_price, sample_count')
        .eq('device_id', input.device_id)
        .eq('storage', storage)
        .eq('carrier', carrier)
        .eq('condition', 'good')
        .limit(1)
        .single()

      if (goodBaseline?.median_trade_price != null && goodBaseline.median_trade_price > 0) {
        const { data: multRow } = await supabase
          .from('trained_condition_multipliers')
          .select('multiplier')
          .eq('condition', input.condition)
          .limit(1)
          .single()
        const mult = multRow?.multiplier ?? 0.82
        anchorPrice = goodBaseline.median_trade_price * Number(mult)
        sampleCount = goodBaseline.sample_count ?? 0
        source = 'trained_good_fallback'
      }
    }

    // 3. Fallback: market_prices or pricing_tables (third-party)
    if (!anchorPrice) {
      const { data: mp } = await supabase
        .from('market_prices')
        .select('wholesale_c_stock')
        .eq('device_id', input.device_id)
        .eq('storage', storage)
        .eq('carrier', carrier)
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()

      anchorPrice = mp?.wholesale_c_stock ?? 0
      if (anchorPrice > 0) source = 'market'
    }

    if (!anchorPrice) {
      const { data: pt } = await supabase
        .from('pricing_tables')
        .select('base_price')
        .eq('device_id', input.device_id)
        .eq('storage', storage)
        .eq('condition', 'new')
        .eq('carrier', carrier)
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()

      anchorPrice = pt?.base_price ?? 0
      if (anchorPrice > 0) source = 'pricing_table'
    }

    if (!anchorPrice || anchorPrice <= 0) {
      return {
        success: false,
        final_price: 0,
        confidence: 0,
        price_date: new Date().toISOString(),
        valid_for_hours: 0,
        breakdown: {},
        error: 'No trained baseline, market price, or pricing table for this device. Run training or add market data.',
      }
    }

    let price = anchorPrice

    // Apply issue deductions
    const issuesApplied: string[] = []
    let totalDeductions = 0
    const deductionKeys = (input.issues || []).map(i => i.toUpperCase().replace(/\s/g, '_'))
    const isBroken = input.condition === 'poor' || deductionKeys.some(k => CRITICAL_ISSUES.includes(k))

    if (isBroken) {
      // Brian's rule: broken = 50% of good working price
      const goodPrice = await this.getGoodPrice(supabase, input.device_id, storage, carrier)
      price = (goodPrice > 0 ? goodPrice : anchorPrice) * 0.5
      totalDeductions = goodPrice - price
      issuesApplied.push('broken_50pct_rule')
    } else {
      for (const issue of deductionKeys) {
        const d = DEFAULT_DEDUCTIONS[issue]
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
    }
    price = Math.max(price, 0)

    const qty = input.quantity ?? 1
    const finalPrice = round2(price * qty)

    // Confidence: higher when using our own data, lower when falling back to third-party
    const confidence =
      source === 'trained'
        ? Math.min(0.95, 0.7 + sampleCount / 100)
        : source === 'trained_good_fallback'
          ? 0.8
          : 0.65

    return {
      success: true,
      final_price: finalPrice,
      trade_price: input.purpose === 'sell' ? undefined : finalPrice,
      cpo_price: input.purpose === 'sell' ? finalPrice : undefined,
      confidence,
      price_date: new Date().toISOString(),
      valid_for_hours: source === 'trained' ? 24 : 12,
      breakdown: {
        anchor_price: anchorPrice,
        source,
        sample_count: sampleCount,
        condition: input.condition,
        issues_applied: issuesApplied,
        deductions: round2(totalDeductions),
        purpose: input.purpose ?? 'buy',
        quantity: qty,
        final_price: finalPrice,
      },
    }
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
    if (data?.median_trade_price) return Number(data.median_trade_price)
    const { data: mp } = await supabase
      .from('market_prices')
      .select('wholesale_c_stock')
      .eq('device_id', deviceId)
      .eq('storage', storage)
      .eq('carrier', carrier)
      .eq('is_active', true)
      .order('effective_date', { ascending: false })
      .limit(1)
      .single()
    return mp?.wholesale_c_stock ?? 0
  }
}
