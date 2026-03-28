// ============================================================================
// CALCULATE BUYBACK GUARANTEE API
// Returns guaranteed buyback price per order item using trade-in pricing logic.
// For CPO orders: we guarantee to buy devices back at this price.
// Falls back to our own internal trained baselines when no market data exists.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'
import type { DeviceCondition } from '@/types'
export const dynamic = 'force-dynamic'

// Condition multipliers (mirrors PricingService — used for cross-condition interpolation)
const CONDITION_MULTIPLIERS: Record<string, number> = {
  new: 1.0,
  excellent: 0.95,
  good: 0.85,
  fair: 0.70,
  poor: 0.50,
}

/**
 * Fallback price estimator when calculatePriceV2 finds no external market data.
 * Strategy (in order):
 *   1. trained_pricing_baselines — exact (device_id, storage, condition)
 *   2. trained_pricing_baselines — same device, any storage → scale by storage ratio
 *   3. trained_pricing_baselines — same device, different condition → scale by condition multiplier ratio
 *   4. Same-make device average from trained baselines → scale by condition multiplier
 *   5. device_catalog specifications MSRP → apply condition multiplier
 * Returns { price, source } or null when nothing found.
 */
async function estimatePriceFromInternalData(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  deviceId: string,
  storage: string,
  condition: DeviceCondition
): Promise<{ price: number; source: string } | null> {
  const conditionMult = CONDITION_MULTIPLIERS[condition] ?? 0.85

  // 1. Exact match: trained_pricing_baselines (device_id, storage, condition)
  const { data: exactBaseline } = await supabase
    .from('trained_pricing_baselines')
    .select('median_trade_price, p25_trade_price, p75_trade_price')
    .eq('device_id', deviceId)
    .eq('storage', storage)
    .eq('condition', condition)
    .order('last_trained_at', { ascending: false })
    .limit(1)
    .single()

  if (exactBaseline?.median_trade_price && exactBaseline.median_trade_price > 0) {
    return { price: exactBaseline.median_trade_price, source: 'trained_baseline_exact' }
  }

  // 2. Same device, any storage — find closest and use as-is (storage variants don't differ drastically)
  const { data: anyStorageBaseline } = await supabase
    .from('trained_pricing_baselines')
    .select('median_trade_price, storage, condition')
    .eq('device_id', deviceId)
    .eq('condition', condition)
    .gt('median_trade_price', 0)
    .order('last_trained_at', { ascending: false })
    .limit(5)

  if (anyStorageBaseline && anyStorageBaseline.length > 0) {
    // Prefer matching storage if available, else take average of all
    const match = anyStorageBaseline.find(r => r.storage === storage)
    const useRow = match || anyStorageBaseline[0]
    if (useRow.median_trade_price > 0) {
      return { price: useRow.median_trade_price, source: 'trained_baseline_any_storage' }
    }
  }

  // 3. Same device, different condition — scale by condition multiplier ratio
  const { data: otherConditionBaseline } = await supabase
    .from('trained_pricing_baselines')
    .select('median_trade_price, condition')
    .eq('device_id', deviceId)
    .gt('median_trade_price', 0)
    .order('last_trained_at', { ascending: false })
    .limit(10)

  if (otherConditionBaseline && otherConditionBaseline.length > 0) {
    // Get learned multipliers if available
    const { data: learnedMults } = await supabase
      .from('trained_condition_multipliers')
      .select('condition, multiplier')

    const multMap: Record<string, number> = {}
    if (learnedMults) {
      for (const r of learnedMults) multMap[r.condition] = r.multiplier
    }
    const effectiveMult = (c: string) => multMap[c] ?? CONDITION_MULTIPLIERS[c] ?? 0.85

    // Pick the row with condition closest to ours (prefer 'good' as reference)
    const referenceRow = otherConditionBaseline.find(r => r.condition === 'good')
      ?? otherConditionBaseline[0]
    const refMult = effectiveMult(referenceRow.condition)
    if (refMult > 0 && referenceRow.median_trade_price > 0) {
      const scaled = (referenceRow.median_trade_price / refMult) * conditionMult
      return { price: Math.round(scaled * 100) / 100, source: 'trained_baseline_cross_condition' }
    }
  }

  // 4. Same-make device average — find other devices from same make with pricing
  const { data: deviceInfo } = await supabase
    .from('device_catalog')
    .select('make, category, specifications')
    .eq('id', deviceId)
    .single()

  if (deviceInfo?.make) {
    // Get all device IDs of same make+category
    const { data: sameCategory } = await supabase
      .from('device_catalog')
      .select('id')
      .eq('make', deviceInfo.make)
      .eq('category', deviceInfo.category || 'phone')
      .eq('is_active', true)
      .neq('id', deviceId)
      .limit(30)

    if (sameCategory && sameCategory.length > 0) {
      const ids = sameCategory.map(r => r.id)
      const { data: siblingBaselines } = await supabase
        .from('trained_pricing_baselines')
        .select('median_trade_price, condition')
        .in('device_id', ids)
        .eq('condition', condition)
        .gt('median_trade_price', 0)

      if (siblingBaselines && siblingBaselines.length > 0) {
        const avg = siblingBaselines.reduce((s, r) => s + r.median_trade_price, 0) / siblingBaselines.length
        return { price: Math.round(avg * 100) / 100, source: 'trained_baseline_same_make_avg' }
      }
    }

    // 5. MSRP from device_catalog specifications
    const specs = deviceInfo.specifications as Record<string, unknown> | null
    const msrp = specs?.msrp ?? specs?.retail_price ?? specs?.rrp
    if (msrp && typeof msrp === 'number' && msrp > 0) {
      // MSRP → apply condition multiplier to get an estimated trade-in value
      // Trade-in is typically ~55–70% of retail; then condition-adjusted
      const estimatedTrade = msrp * 0.60 * conditionMult
      return { price: Math.round(estimatedTrade * 100) / 100, source: 'device_catalog_msrp_estimate' }
    }
    if (msrp && typeof msrp === 'string') {
      const v = parseFloat(msrp as string)
      if (!Number.isNaN(v) && v > 0) {
        const estimatedTrade = v * 0.60 * conditionMult
        return { price: Math.round(estimatedTrade * 100) / 100, source: 'device_catalog_msrp_estimate' }
      }
    }
  }

  return null
}


const STORAGE_OPTIONS = ['128GB', '256GB', '512GB', '1TB']
const mapCondition = (c?: string): DeviceCondition => {
  if (!c) return 'good'
  const s = String(c).toLowerCase()
  if (s === 'new') return 'new'
  if (['excellent', 'excellant'].some((x) => s.includes(x))) return 'excellent'
  if (s === 'good') return 'good'
  if (s === 'fair') return 'fair'
  if (['poor', 'broken'].some((x) => s.includes(x))) return 'poor'
  return 'good'
}

/** Add months to a date, return YYYY-MM-DD */
function addMonths(date: Date, months: number): string {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const items = Array.isArray(body.items) ? body.items : body.items ? [body.items] : []
    const validMonths = Math.min(Math.max(parseInt(body.valid_months || '24', 10) || 24, 1), 60)
    const baseDate = body.base_date ? new Date(body.base_date) : new Date()
    const validUntil = addMonths(baseDate, validMonths)
    // Optional: override depreciation rate per order (editable in order section after quote)
    const depreciationRateOverride = body.depreciation_rate != null ? parseFloat(body.depreciation_rate) : null

    if (items.length === 0) {
      return NextResponse.json({ data: [], valid_until: validUntil })
    }

    // Fetch depreciation settings from pricing_settings table (or use override)
    const { data: settingsRows } = await supabase
      .from('pricing_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['cpo_depreciation_rate', 'cpo_buyback_years'])

    let depreciationRate = 15 // default annual depreciation %
    let buybackYears = 3     // default years
    if (settingsRows) {
      for (const row of settingsRows) {
        if (row.setting_key === 'cpo_depreciation_rate') {
          const v = parseFloat(row.setting_value)
          if (!Number.isNaN(v) && v >= 0 && v <= 50) depreciationRate = v
        }
        if (row.setting_key === 'cpo_buyback_years') {
          const v = parseInt(row.setting_value, 10)
          if (!Number.isNaN(v) && v >= 1 && v <= 10) buybackYears = v
        }
      }
    }

    const limit = Math.min(items.length, 80)
    const results: Array<{
      id: string
      device_id: string
      storage: string
      condition: DeviceCondition
      guaranteed_buyback_price: number
      buyback_condition: DeviceCondition
      buyback_valid_until: string
      depreciation_schedule: Array<{
        year: number
        value: number
        depreciation_pct: number
      }>
      /** Set when price was derived from our internal fallback logic (not live market data) */
      is_estimated?: boolean
      /** Source of the price used */
      price_source?: string
      error?: string
    }> = []

    for (const item of items.slice(0, limit)) {
      const id = item.id
      const device_id = item.device_id
      const storage = (item.storage || '128GB').replace(/\s+/g, '').toUpperCase()
      const condition = mapCondition(item.condition ?? item.buyback_condition ?? 'good')
      const normalizedStorage = STORAGE_OPTIONS.includes(storage) ? storage : '128GB'

      if (!device_id) {
        results.push({
          id: id || '',
          device_id: '',
          storage,
          condition,
          guaranteed_buyback_price: 0,
          buyback_condition: condition,
          buyback_valid_until: validUntil,
          depreciation_schedule: [],
          error: 'device_id required',
        })
        continue
      }

      try {
        const result = await PricingService.calculatePriceV2({
          device_id,
          storage: normalizedStorage,
          carrier: 'Unlocked',
          condition,
          quantity: 1,
        })

        // Primary price source failed — try our internal data fallback
        let tradePrice = result.success ? (result.trade_price ?? 0) : 0
        let priceSource: string | undefined = tradePrice > 0 ? 'market_data' : undefined
        let estimatedFlag = false

        if (tradePrice <= 0) {
          const fallback = await estimatePriceFromInternalData(supabase, device_id, normalizedStorage, condition)
          if (fallback && fallback.price > 0) {
            tradePrice = fallback.price
            priceSource = fallback.source
            estimatedFlag = true
          }
        }

        if (tradePrice <= 0) {
          results.push({
            id: id || '',
            device_id,
            storage: normalizedStorage,
            condition,
            guaranteed_buyback_price: 0,
            buyback_condition: condition,
            buyback_valid_until: validUntil,
            depreciation_schedule: [],
            error: result.error || 'No price data available — add market data or enable scraper',
          })
          continue
        }

        // Build depreciation schedule using resolved trade price
        const schedule = Array.from({ length: buybackYears + 1 }, (_, yr) => {
          const factor = Math.pow(1 - depreciationRate / 100, yr)
          return {
            year: yr,
            value: Math.round(tradePrice * factor * 100) / 100,
            depreciation_pct: yr === 0 ? 0 : Math.round((1 - factor) * 10000) / 100,
          }
        })

        results.push({
          id: id || '',
          device_id,
          storage: normalizedStorage,
          condition,
          guaranteed_buyback_price: tradePrice,
          buyback_condition: condition,
          buyback_valid_until: validUntil,
          depreciation_schedule: schedule,
          ...(estimatedFlag && { price_source: priceSource, is_estimated: true }),
        })
      } catch (err) {
        // Even on unexpected errors, attempt the internal fallback before giving up
        try {
          const fallback = await estimatePriceFromInternalData(supabase, device_id, normalizedStorage, condition)
          if (fallback && fallback.price > 0) {
            const schedule = Array.from({ length: buybackYears + 1 }, (_, yr) => {
              const factor = Math.pow(1 - depreciationRate / 100, yr)
              return {
                year: yr,
                value: Math.round(fallback.price * factor * 100) / 100,
                depreciation_pct: yr === 0 ? 0 : Math.round((1 - factor) * 10000) / 100,
              }
            })
            results.push({
              id: id || '',
              device_id,
              storage: normalizedStorage,
              condition,
              guaranteed_buyback_price: fallback.price,
              buyback_condition: condition,
              buyback_valid_until: validUntil,
              depreciation_schedule: schedule,
              price_source: fallback.source,
              is_estimated: true,
            })
          } else {
            results.push({
              id: id || '',
              device_id: device_id || '',
              storage: normalizedStorage,
              condition,
              guaranteed_buyback_price: 0,
              buyback_condition: condition,
              buyback_valid_until: validUntil,
              depreciation_schedule: [],
              error: err instanceof Error ? err.message : 'Unknown error',
            })
          }
        } catch {
          results.push({
            id: id || '',
            device_id: device_id || '',
            storage: normalizedStorage,
            condition,
            guaranteed_buyback_price: 0,
            buyback_condition: condition,
            buyback_valid_until: validUntil,
            depreciation_schedule: [],
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }
    }

    return NextResponse.json({
      data: results,
      valid_until: validUntil,
      depreciation_rate: depreciationRate,
      buyback_years: buybackYears,
    })
  } catch (error) {
    console.error('Error in calculate-buyback:', error)
    return NextResponse.json(
      { error: 'Failed to calculate buyback prices' },
      { status: 500 }
    )
  }
}
