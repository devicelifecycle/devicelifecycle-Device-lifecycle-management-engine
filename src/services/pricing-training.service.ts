// ============================================================================
// PRICING TRAINING SERVICE
// ============================================================================
// Aggregates ALL available pricing signals — internal data (order_items,
// imei_records, sales_history) AND external data (market_prices,
// competitor_prices from scrapers). Builds self-sufficient baselines so
// the data-driven model doesn't need live market lookups at calculation time.

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { DeviceCondition } from '@/types'

const CONDITION_ORDER: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']

const CONDITION_MULTIPLIERS: Record<string, number> = {
  new: 1.0,
  excellent: 0.95,
  good: 0.85,
  fair: 0.70,
  poor: 0.50,
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo])
}

function weightedMedian(arr: Array<{ value: number; weight: number }>): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a.value - b.value)
  const totalWeight = sorted.reduce((s, e) => s + e.weight, 0)
  let cumulative = 0
  for (const entry of sorted) {
    cumulative += entry.weight
    if (cumulative >= totalWeight / 2) return entry.value
  }
  return sorted[sorted.length - 1].value
}

export interface TrainingResult {
  baselines_upserted: number
  condition_multipliers_updated: boolean
  data_sources_used: string[]
  sample_counts: {
    order_items: number
    imei_records: number
    sales_history: number
    market_prices: number
    competitor_prices: number
  }
  errors: string[]
}

interface PriceEntry {
  price: number
  weight: number
  source: string
  age_days: number
}

export class PricingTrainingService {
  /**
   * Run full training: ingest all pricing signals, compute weighted baselines.
   * 
   * Data sources and their trust weights:
   *   - Our own completed orders (weight 1.0) — most reliable
   *   - IMEI-level records (weight 0.9) — granular internal data
   *   - Sales history (weight 0.85) — confirmed transactions
   *   - Market prices / wholesale data (weight 0.7) — external reference
   *   - Competitor scraped prices (weight 0.6) — external, varies by freshness
   *
   * Recency decay: prices older than 90 days get reduced weight.
   */
  static async train(): Promise<TrainingResult> {
    const supabase = createServerSupabaseClient()
    const errors: string[] = []
    const sampleCounts = {
      order_items: 0,
      imei_records: 0,
      sales_history: 0,
      market_prices: 0,
      competitor_prices: 0,
    }

    // Key: "device_id|storage|condition" -> weighted price entries
    const priceMap = new Map<string, PriceEntry[]>()
    const now = Date.now()

    const ageDays = (dateStr: string | null | undefined): number => {
      if (!dateStr) return 30
      return Math.max(0, (now - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000))
    }

    const recencyWeight = (days: number): number => {
      if (days <= 7) return 1.0
      if (days <= 30) return 0.95
      if (days <= 60) return 0.85
      if (days <= 90) return 0.7
      if (days <= 180) return 0.5
      return 0.3
    }

    const addPrice = (
      deviceId: string,
      storage: string,
      condition: string,
      price: number,
      sourceWeight: number,
      source: string,
      dateStr?: string | null
    ) => {
      if (!deviceId || !price || !Number.isFinite(price) || price <= 0) return
      const days = ageDays(dateStr)
      const weight = sourceWeight * recencyWeight(days)
      const key = `${deviceId}|${storage || '128GB'}|${condition}`
      const arr = priceMap.get(key) ?? []
      arr.push({ price, weight, source, age_days: days })
      priceMap.set(key, arr)
    }

    // ------------------------------------------------------------------
    // SOURCE 1: Our completed orders (highest trust — real transactions)
    // ------------------------------------------------------------------
    try {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, updated_at')
        .in('status', ['accepted', 'quoted', 'closed', 'delivered', 'shipped', 'qc_complete', 'ready_to_ship'])

      if (orders?.length) {
        const orderIds = orders.map(o => o.id)
        const orderDates: Record<string, string> = {}
        for (const o of orders) orderDates[o.id] = o.updated_at

        const { data: items } = await supabase
          .from('order_items')
          .select('device_id, claimed_condition, actual_condition, quoted_price, final_price, unit_price, order_id')
          .in('order_id', orderIds)

        for (const it of items || []) {
          const price = it.final_price ?? it.quoted_price ?? it.unit_price
          const cond = (it.actual_condition ?? it.claimed_condition ?? 'good') as string
          if (price != null && Number(price) > 0) {
            addPrice(it.device_id, '128GB', cond, Number(price), 1.0, 'order_items', orderDates[it.order_id])
            sampleCounts.order_items++
          }
        }
      }
    } catch (e) {
      errors.push(`order_items: ${e instanceof Error ? e.message : 'Unknown'}`)
    }

    // ------------------------------------------------------------------
    // SOURCE 2: IMEI records (high trust — per-device level)
    // ------------------------------------------------------------------
    try {
      const { data: imeis } = await supabase
        .from('imei_records')
        .select('device_id, claimed_condition, actual_condition, quoted_price, final_price, updated_at')
        .limit(5000)

      for (const ir of imeis || []) {
        const price = ir.final_price ?? ir.quoted_price
        const cond = (ir.actual_condition ?? ir.claimed_condition ?? 'good') as string
        if (price != null && Number(price) > 0) {
          addPrice(ir.device_id, '128GB', cond, Number(price), 0.9, 'imei_records', ir.updated_at)
          sampleCounts.imei_records++
        }
      }
    } catch (e) {
      errors.push(`imei_records: ${e instanceof Error ? e.message : 'Unknown'}`)
    }

    // ------------------------------------------------------------------
    // SOURCE 3: Sales history (high trust — confirmed sales)
    // ------------------------------------------------------------------
    try {
      const { data: sales } = await supabase
        .from('sales_history')
        .select('device_id, storage, condition, sold_price, sold_date')
        .not('sold_price', 'is', null)
        .gte('sold_date', new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString())
        .limit(5000)

      for (const s of sales || []) {
        const cond = s.condition ?? 'good'
        const storage = s.storage ?? '128GB'
        addPrice(s.device_id, storage, cond, Number(s.sold_price), 0.85, 'sales_history', s.sold_date)
        sampleCounts.sales_history++
      }
    } catch (e) {
      errors.push(`sales_history: ${e instanceof Error ? e.message : 'Unknown'}`)
    }

    // ------------------------------------------------------------------
    // SOURCE 4: Market prices (medium trust — external wholesale data)
    // Derive per-condition prices using condition multipliers applied
    // to the wholesale C-stock price (which represents ~"good" condition).
    // ------------------------------------------------------------------
    try {
      const { data: marketPrices } = await supabase
        .from('market_prices')
        .select('device_id, storage, carrier, wholesale_c_stock, wholesale_b_minus, marketplace_price, trade_price, effective_date, updated_at')
        .eq('is_active', true)

      for (const mp of marketPrices || []) {
        const basePrice = mp.wholesale_c_stock || mp.wholesale_b_minus || 0
        if (basePrice <= 0) continue
        const storage = mp.storage || '128GB'
        const dateStr = mp.updated_at || mp.effective_date

        // C-stock is roughly "good" condition wholesale
        addPrice(mp.device_id, storage, 'good', basePrice, 0.7, 'market_wholesale', dateStr)

        // Derive other conditions from this anchor
        for (const cond of CONDITION_ORDER) {
          if (cond === 'good') continue
          const mult = CONDITION_MULTIPLIERS[cond] / CONDITION_MULTIPLIERS['good']
          const derivedPrice = basePrice * mult
          if (derivedPrice > 0) {
            addPrice(mp.device_id, storage, cond, derivedPrice, 0.55, 'market_derived', dateStr)
          }
        }

        // Trade price from market data (if set) is a direct "good" signal
        if (mp.trade_price && Number(mp.trade_price) > 0) {
          addPrice(mp.device_id, storage, 'good', Number(mp.trade_price), 0.75, 'market_trade', dateStr)
        }

        // Marketplace price can inform the upper bound
        if (mp.marketplace_price && Number(mp.marketplace_price) > 0) {
          // Marketplace is retail-ish — discount ~20% for trade-in equivalent
          const tradeEquiv = Number(mp.marketplace_price) * 0.8
          addPrice(mp.device_id, storage, 'good', tradeEquiv, 0.5, 'market_marketplace', dateStr)
        }

        sampleCounts.market_prices++
      }
    } catch (e) {
      errors.push(`market_prices: ${e instanceof Error ? e.message : 'Unknown'}`)
    }

    // ------------------------------------------------------------------
    // SOURCE 5: Competitor prices from scraper (medium trust, freshness matters)
    // These are trade-in prices competitors offer — we learn from them.
    // ------------------------------------------------------------------
    try {
      const { data: compPrices } = await supabase
        .from('competitor_prices')
        .select('device_id, storage, competitor_name, trade_in_price, sell_price, scraped_at, updated_at')
        .not('trade_in_price', 'is', null)

      for (const cp of compPrices || []) {
        const tradePrice = Number(cp.trade_in_price) || 0
        if (tradePrice <= 0) continue
        const storage = cp.storage || '128GB'
        const dateStr = cp.updated_at || cp.scraped_at
        const days = ageDays(dateStr)

        // Competitor trade-in prices represent what market pays for "good" condition
        // Fresh scraped data is more valuable
        const freshness = days <= 3 ? 0.65 : days <= 7 ? 0.6 : 0.5
        addPrice(cp.device_id, storage, 'good', tradePrice, freshness, `competitor:${cp.competitor_name}`, dateStr)

        // Derive other conditions
        for (const cond of CONDITION_ORDER) {
          if (cond === 'good') continue
          const mult = CONDITION_MULTIPLIERS[cond] / CONDITION_MULTIPLIERS['good']
          const derivedPrice = tradePrice * mult
          if (derivedPrice > 0) {
            addPrice(cp.device_id, storage, cond, derivedPrice, freshness * 0.8, `competitor_derived:${cp.competitor_name}`, dateStr)
          }
        }

        // Sell price (if available) gives retail reference
        if (cp.sell_price && Number(cp.sell_price) > 0) {
          const sellTradeEquiv = Number(cp.sell_price) * 0.75
          addPrice(cp.device_id, storage, 'good', sellTradeEquiv, 0.4, `competitor_sell:${cp.competitor_name}`, dateStr)
        }

        sampleCounts.competitor_prices++
      }
    } catch (e) {
      errors.push(`competitor_prices: ${e instanceof Error ? e.message : 'Unknown'}`)
    }

    // ------------------------------------------------------------------
    // COMPUTE WEIGHTED BASELINES
    // ------------------------------------------------------------------
    const nowIso = new Date().toISOString()
    let baselinesUpserted = 0

    for (const [key, entries] of Array.from(priceMap.entries())) {
      if (entries.length === 0) continue
      const [deviceId, storage, condition] = key.split('|')

      // Weighted median for robustness against outliers
      const wMedian = weightedMedian(entries.map(e => ({ value: e.price, weight: e.weight })))
      const prices = entries.map(e => e.price)
      const p25 = percentile(prices, 25)
      const p75 = percentile(prices, 75)

      const sources = Array.from(new Set(entries.map(e => e.source)))
      const totalWeight = entries.reduce((s, e) => s + e.weight, 0)

      const { error } = await supabase.from('trained_pricing_baselines').upsert(
        {
          device_id: deviceId,
          storage: storage === 'default' ? '128GB' : storage,
          carrier: 'Unlocked',
          condition,
          median_trade_price: Math.round(wMedian * 100) / 100,
          p25_trade_price: Math.round(p25 * 100) / 100,
          p75_trade_price: Math.round(p75 * 100) / 100,
          sample_count: entries.length,
          last_trained_at: nowIso,
          data_sources: sources,
          updated_at: nowIso,
        },
        { onConflict: 'device_id,storage,carrier,condition' }
      )
      if (!error) baselinesUpserted++
      else errors.push(`baseline upsert ${key}: ${error.message}`)
    }

    // ------------------------------------------------------------------
    // LEARN CONDITION MULTIPLIERS from actual data
    // ------------------------------------------------------------------
    const goodPrices = new Map<string, number>()
    for (const [key, entries] of Array.from(priceMap.entries())) {
      const [deviceId, storage, condition] = key.split('|')
      if (condition === 'good' && entries.length >= 1) {
        goodPrices.set(`${deviceId}|${storage}`, weightedMedian(entries.map(e => ({ value: e.price, weight: e.weight }))))
      }
    }

    const conditionSamples: Record<string, number[]> = {
      new: [], excellent: [], good: [], fair: [], poor: [],
    }

    for (const [key, entries] of Array.from(priceMap.entries())) {
      const [deviceId, storage, condition] = key.split('|')
      const goodBase = goodPrices.get(`${deviceId}|${storage}`)
      if (!goodBase || goodBase <= 0) continue
      const med = weightedMedian(entries.map(e => ({ value: e.price, weight: e.weight })))
      const mult = med / goodBase
      if (condition in conditionSamples && mult > 0 && mult <= 2) {
        conditionSamples[condition].push(mult)
      }
    }

    let multipliersUpdated = false
    for (const cond of CONDITION_ORDER) {
      const samples = conditionSamples[cond]
      if (samples.length >= 3) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length
        const mult = Math.min(1.15, Math.max(0.3, avg))
        const { error } = await supabase.from('trained_condition_multipliers').upsert(
          {
            condition: cond,
            multiplier: Math.round(mult * 10000) / 10000,
            sample_count: samples.length,
            last_trained_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: 'condition' }
        )
        if (!error) multipliersUpdated = true
      }
    }

    return {
      baselines_upserted: baselinesUpserted,
      condition_multipliers_updated: multipliersUpdated,
      data_sources_used: ['order_items', 'imei_records', 'sales_history', 'market_prices', 'competitor_prices'],
      sample_counts: sampleCounts,
      errors,
    }
  }
}
