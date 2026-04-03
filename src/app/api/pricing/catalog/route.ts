// ============================================================================
// PRICING CATALOG API - Full data by category
// ============================================================================
// Returns all pricing data grouped by device category (phone, tablet, laptop, watch)
// for comprehensive display and export.

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { DeviceCategory } from '@/types'

export const dynamic = 'force-dynamic'

interface DeviceWithPricing {
  id: string
  make: string
  model: string
  category: DeviceCategory | null
  baselines: { storage: string; condition: string; median: number; samples: number; sources: string[] }[]
  market_prices: { storage: string; wholesale: number; trade?: number }[]
  pricing_tables: { condition: string; storage?: string; base: number }[]
  competitor_count: number
  price_range: { min: number; max: number } | null
}

interface CategorySummary {
  category: DeviceCategory
  device_count: number
  total_baselines: number
  total_market_entries: number
  total_pricing_entries: number
  total_competitor_entries: number
  price_range: { min: number; max: number } | null
  devices: DeviceWithPricing[]
}

const PAGE_SIZE = 1000

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>
): Promise<T[]> {
  const rows: T[] = []

  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await fetchPage(from, to)

    if (error) {
      throw new Error(error.message || 'Failed to fetch paginated rows')
    }

    const batch = data || []
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) {
      break
    }
  }

  return rows
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
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

    const [devices, baselines, marketPrices, pricingTables, compPrices] = await Promise.all([
      fetchAllRows<{ id: string; make: string; model: string; category: string | null }>((from, to) => supabase
        .from('device_catalog')
        .select('id, make, model, category')
        .eq('is_active', true)
        .order('make')
        .order('model')
        .range(from, to)),
      fetchAllRows<{ device_id: string; storage: string; condition: string; median_trade_price: number; sample_count: number; data_sources: string[] }>((from, to) => supabase
        .from('trained_pricing_baselines')
        .select('device_id, storage, condition, median_trade_price, sample_count, data_sources')
        .range(from, to)),
      fetchAllRows<{ device_id: string; storage: string; wholesale_c_stock: number; trade_price?: number }>((from, to) => supabase
        .from('market_prices')
        .select('device_id, storage, wholesale_c_stock, trade_price')
        .eq('is_active', true)
        .range(from, to)),
      fetchAllRows<{ device_id: string; condition: string; storage?: string; base_price: number }>((from, to) => supabase
        .from('pricing_tables')
        .select('device_id, condition, storage, base_price')
        .eq('is_active', true)
        .range(from, to)),
      fetchAllRows<{ device_id: string }>((from, to) => supabase
        .from('competitor_prices')
        .select('device_id')
        .range(from, to)),
    ])

    const baselineByDevice = new Map<string, typeof baselines>()
    for (const b of baselines) {
      if (!b.device_id) continue
      const arr = baselineByDevice.get(b.device_id) || []
      arr.push(b)
      baselineByDevice.set(b.device_id, arr)
    }

    const marketByDevice = new Map<string, typeof marketPrices>()
    for (const m of marketPrices) {
      if (!m.device_id) continue
      const arr = marketByDevice.get(m.device_id) || []
      arr.push(m)
      marketByDevice.set(m.device_id, arr)
    }

    const pricingByDevice = new Map<string, typeof pricingTables>()
    for (const p of pricingTables) {
      if (!p.device_id) continue
      const arr = pricingByDevice.get(p.device_id) || []
      arr.push(p)
      pricingByDevice.set(p.device_id, arr)
    }

    const compCountByDevice = new Map<string, number>()
    for (const c of compPrices) {
      if (!c.device_id) continue
      compCountByDevice.set(c.device_id, (compCountByDevice.get(c.device_id) || 0) + 1)
    }

    const categories: DeviceCategory[] = ['phone', 'tablet', 'laptop', 'watch', 'other']
    const result: CategorySummary[] = []

    for (const cat of categories) {
      const catDevices = devices.filter(d => (d.category || 'other') === cat)
      const devicesWithPricing: DeviceWithPricing[] = []
      let totalBaselines = 0
      let totalMarket = 0
      let totalPricing = 0
      let totalComp = 0
      let globalMin = Infinity
      let globalMax = -Infinity

      for (const d of catDevices) {
        const bl = baselineByDevice.get(d.id) || []
        const mp = marketByDevice.get(d.id) || []
        const pt = pricingByDevice.get(d.id) || []
        const cc = compCountByDevice.get(d.id) || 0

        totalBaselines += bl.length
        totalMarket += mp.length
        totalPricing += pt.length
        totalComp += cc

        const baselineRows = bl.map(b => ({
          storage: b.storage || '128GB',
          condition: b.condition || 'good',
          median: Number(b.median_trade_price) || 0,
          samples: b.sample_count || 0,
          sources: (b.data_sources as string[]) || [],
        }))

        const marketRows = mp
          .filter(m => Number(m.wholesale_c_stock) > 0)
          .map(m => ({
            storage: m.storage || '128GB',
            wholesale: Number(m.wholesale_c_stock) || 0,
            trade: m.trade_price != null ? Number(m.trade_price) : undefined,
          }))

        const pricingRows = pt
          .filter(p => Number(p.base_price) > 0)
          .map(p => ({
            condition: p.condition || 'new',
            storage: p.storage,
            base: Number(p.base_price) || 0,
          }))

        const allPrices = [
          ...baselineRows.map(r => r.median),
          ...marketRows.map(r => r.wholesale).filter(Boolean),
          ...marketRows.map(r => r.trade).filter((v): v is number => v != null && v > 0),
          ...pricingRows.map(r => r.base),
        ].filter(v => v > 0)

        const priceRange = allPrices.length > 0
          ? { min: Math.min(...allPrices), max: Math.max(...allPrices) }
          : null

        if (priceRange) {
          globalMin = Math.min(globalMin, priceRange.min)
          globalMax = Math.max(globalMax, priceRange.max)
        }

        devicesWithPricing.push({
          id: d.id,
          make: d.make,
          model: d.model,
          category: (d.category as DeviceCategory) || 'other',
          baselines: baselineRows,
          market_prices: marketRows,
          pricing_tables: pricingRows,
          competitor_count: cc,
          price_range: priceRange,
        })
      }

      result.push({
        category: cat,
        device_count: catDevices.length,
        total_baselines: totalBaselines,
        total_market_entries: totalMarket,
        total_pricing_entries: totalPricing,
        total_competitor_entries: totalComp,
        price_range: globalMin !== Infinity ? { min: globalMin, max: globalMax } : null,
        devices: devicesWithPricing,
      })
    }

    return NextResponse.json({
      data: result,
      summary: {
        total_devices: devices.length,
        total_baselines: baselines.length,
        total_market_entries: marketPrices.length,
        total_pricing_entries: pricingTables.length,
        total_competitor_entries: compPrices.length,
      },
    })
  } catch (error) {
    console.error('Pricing catalog error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pricing catalog' },
      { status: 500 }
    )
  }
}
