// ============================================================================
// PRICING TRAINING SERVICE
// ============================================================================
// Aggregates internal data (order_items, imei_records, sales_history) and
// trains our own pricing baselines. Reduces dependency on competitors/market.

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { DeviceCondition } from '@/types'

const CONDITION_ORDER: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']

/** Median of numbers */
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Percentile */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo])
}

export interface TrainingResult {
  baselines_upserted: number
  condition_multipliers_updated: boolean
  data_sources_used: string[]
  sample_counts: { order_items: number; imei_records: number; sales_history: number }
  errors: string[]
}

export class PricingTrainingService {
  /**
   * Run full training: aggregate prices from our data, compute baselines.
   */
  static async train(): Promise<TrainingResult> {
    const supabase = createServerSupabaseClient()
    const errors: string[] = []
    const sampleCounts = { order_items: 0, imei_records: 0, sales_history: 0 }

    // Map: "device_id|storage|condition" -> prices[]
    const priceMap = new Map<string, number[]>()
    const carrier = 'Unlocked'

    const addPrice = (deviceId: string, storage: string, condition: string, price: number) => {
      if (!deviceId || !price || !Number.isFinite(price) || price <= 0) return
      const key = `${deviceId}|${storage || 'default'}|${condition}`
      const arr = priceMap.get(key) ?? []
      arr.push(price)
      priceMap.set(key, arr)
    }

    // 1. order_items: quoted_price or final_price, claimed_condition or actual_condition
    try {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .in('status', ['accepted', 'quoted', 'closed', 'delivered', 'shipped', 'qc_complete', 'ready_to_ship'])

      if (orders?.length) {
        const orderIds = orders.map(o => o.id)
        const { data: items } = await supabase
          .from('order_items')
          .select('device_id, storage, claimed_condition, actual_condition, quoted_price, final_price')
          .in('order_id', orderIds)

        for (const it of items || []) {
          const price = it.final_price ?? it.quoted_price
          const cond = (it.actual_condition ?? it.claimed_condition ?? 'good') as string
          const storage = it.storage ?? '128GB'
          if (price != null && cond) {
            addPrice(it.device_id, storage, cond, Number(price))
            sampleCounts.order_items++
          }
        }
      }
    } catch (e) {
      errors.push(`order_items: ${e instanceof Error ? e.message : 'Unknown'}`)
    }

    // 2. imei_records: final_price or quoted_price, actual_condition or claimed_condition
    try {
      const { data: imeis } = await supabase
        .from('imei_records')
        .select('device_id, claimed_condition, actual_condition, quoted_price, final_price, order_item_id')
        .limit(5000)

      const itemIds = [...new Set((imeis || []).map(ir => ir.order_item_id).filter(Boolean))] as string[]
      const storageByItem: Record<string, string> = {}
      if (itemIds.length > 0) {
        const { data: items } = await supabase
          .from('order_items')
          .select('id, storage')
          .in('id', itemIds)
        for (const it of items || []) {
          storageByItem[it.id] = it.storage ?? '128GB'
        }
      }

      for (const ir of imeis || []) {
        const price = ir.final_price ?? ir.quoted_price
        const cond = (ir.actual_condition ?? ir.claimed_condition ?? 'good') as string
        if (price != null && cond) {
          const storage = ir.order_item_id ? storageByItem[ir.order_item_id] ?? '128GB' : '128GB'
          addPrice(ir.device_id, storage, cond, Number(price))
          sampleCounts.imei_records++
        }
      }
    } catch (e) {
      errors.push(`imei_records: ${e instanceof Error ? e.message : 'Unknown'}`)
    }

    // 3. sales_history
    try {
      const { data: sales } = await supabase
        .from('sales_history')
        .select('device_id, storage, condition, sold_price')
        .not('sold_price', 'is', null)
        .gte('sold_date', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
        .limit(5000)

      for (const s of sales || []) {
        const cond = s.condition ?? 'good'
        const storage = s.storage ?? '128GB'
        addPrice(s.device_id, storage, cond, Number(s.sold_price))
        sampleCounts.sales_history++
      }
    } catch (e) {
      errors.push(`sales_history: ${e instanceof Error ? e.message : 'Unknown'}`)
    }

    // Compute baselines and upsert
    const now = new Date().toISOString()
    let baselinesUpserted = 0

    for (const [key, prices] of priceMap) {
      if (prices.length < 2) continue // require min 2 samples for stability
      const [deviceId, storage, condition] = key.split('|')
      const med = median(prices)
      const p25 = percentile(prices, 25)
      const p75 = percentile(prices, 75)

      const { error } = await supabase.from('trained_pricing_baselines').upsert(
        {
          device_id: deviceId,
          storage: storage === 'default' ? '128GB' : storage,
          carrier,
          condition,
          median_trade_price: Math.round(med * 100) / 100,
          p25_trade_price: Math.round(p25 * 100) / 100,
          p75_trade_price: Math.round(p75 * 100) / 100,
          sample_count: prices.length,
          last_trained_at: now,
          data_sources: ['order_items', 'imei_records', 'sales_history'],
          updated_at: now,
        },
        { onConflict: 'device_id,storage,carrier,condition' }
      )
      if (!error) baselinesUpserted++
      else errors.push(`baseline upsert ${key}: ${error.message}`)
    }

    // 4. Learn condition multipliers (ratio to "good" baseline)
    const goodPrices = new Map<string, number>() // device|storage -> median for "good"
    for (const [key, prices] of priceMap) {
      const [deviceId, storage, condition] = key.split('|')
      if (condition === 'good' && prices.length >= 2) {
        goodPrices.set(`${deviceId}|${storage}`, median(prices))
      }
    }

    const conditionSamples: Record<string, number[]> = {
      new: [],
      excellent: [],
      good: [],
      fair: [],
      poor: [],
    }

    for (const [key, prices] of priceMap) {
      const [deviceId, storage, condition] = key.split('|')
      const goodBase = goodPrices.get(`${deviceId}|${storage}`)
      if (!goodBase || goodBase <= 0) continue
      const med = median(prices)
      const mult = med / goodBase
      if (condition in conditionSamples && mult > 0 && mult <= 2) {
        conditionSamples[condition].push(mult)
      }
    }

    let multipliersUpdated = false
    for (const cond of CONDITION_ORDER) {
      const samples = conditionSamples[cond]
      if (samples.length >= 5) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length
        const mult = Math.min(1, Math.max(0.3, avg))
        const { error } = await supabase.from('trained_condition_multipliers').upsert(
          {
            condition: cond,
            multiplier: Math.round(mult * 10000) / 10000,
            sample_count: samples.length,
            last_trained_at: now,
            updated_at: now,
          },
          { onConflict: 'condition' }
        )
        if (!error) multipliersUpdated = true
      }
    }

    return {
      baselines_upserted: baselinesUpserted,
      condition_multipliers_updated: multipliersUpdated,
      data_sources_used: ['order_items', 'imei_records', 'sales_history'],
      sample_counts: sampleCounts,
      errors,
    }
  }
}
