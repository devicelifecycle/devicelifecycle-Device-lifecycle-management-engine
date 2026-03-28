#!/usr/bin/env npx tsx
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local'), override: true })
config({ path: resolve(process.cwd(), '.env'), override: false })

const PAGE_SIZE = 1000
const SOURCE = 'bootstrap_market_competitor_v1'
const TRAINING_CONDITIONS = ['excellent', 'good', 'fair', 'poor'] as const

type TrainingCondition = (typeof TRAINING_CONDITIONS)[number]

const CONDITION_MULTIPLIERS: Record<TrainingCondition, number> = {
  excellent: 1.1,
  good: 1.0,
  fair: 0.82,
  poor: 0.6,
}

type CompetitorRow = {
  device_id: string
  storage: string | null
  condition: string | null
  trade_in_price: number | null
  sell_price: number | null
  competitor_name: string | null
  updated_at: string | null
  scraped_at: string | null
}

type MarketRow = {
  device_id: string
  storage: string | null
  trade_price: number | null
  cpo_price: number | null
  wholesale_c_stock: number | null
  marketplace_price: number | null
  updated_at: string | null
  effective_date: string | null
}

type DeviceRow = {
  id: string
  make: string
  model: string
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeCondition(condition: string | null | undefined): TrainingCondition {
  const normalized = (condition || 'good').toLowerCase().trim()
  if (normalized === 'excellent' || normalized === 'like_new' || normalized === 'new') return 'excellent'
  if (normalized === 'fair') return 'fair'
  if (normalized === 'poor' || normalized === 'broken' || normalized === 'defective') return 'poor'
  return 'good'
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function fetchAllRows<T>(
  createServiceRoleClient: () => any,
  table: string,
  selectClause: string,
  configure?: (query: any) => any
): Promise<T[]> {
  const supabase = createServiceRoleClient()
  const rows: T[] = []
  let page = 0

  while (true) {
    let query = supabase
      .from(table)
      .select(selectClause)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (configure) {
      query = configure(query)
    }

    const { data, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)

    const batch = (data || []) as T[]
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) break
    page++
  }

  return rows
}

async function main() {
  const { createServiceRoleClient } = await import('../src/lib/supabase/service-role')
  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  console.log('\nSeeding validated pricing training data from live market + competitor signals...')
  console.log(`Source tag: ${SOURCE}`)

  const [devices, competitorRows, marketRows] = await Promise.all([
    fetchAllRows<DeviceRow>(createServiceRoleClient, 'device_catalog', 'id, make, model', (query) => query.eq('is_active', true)),
    fetchAllRows<CompetitorRow>(
      createServiceRoleClient,
      'competitor_prices',
      'device_id, storage, condition, trade_in_price, sell_price, competitor_name, updated_at, scraped_at',
      (query) => query.or('trade_in_price.gt.0,sell_price.gt.0')
    ),
    fetchAllRows<MarketRow>(
      createServiceRoleClient,
      'market_prices',
      'device_id, storage, trade_price, cpo_price, wholesale_c_stock, marketplace_price, updated_at, effective_date',
      (query) => query.eq('is_active', true)
    ),
  ])

  const deviceMap = new Map(devices.map((device) => [device.id, device]))
  const marketMap = new Map<string, MarketRow>()
  const competitorMap = new Map<
    string,
    {
      trade: number[]
      sell: number[]
      latest: string | null
      competitors: Set<string>
    }
  >()
  const comboKeys = new Set<string>()

  for (const row of marketRows) {
    const storage = row.storage || '128GB'
    marketMap.set(`${row.device_id}|${storage}`, row)
    for (const condition of TRAINING_CONDITIONS) {
      comboKeys.add(`${row.device_id}|${storage}|${condition}`)
    }
  }

  for (const row of competitorRows) {
    const storage = row.storage || '128GB'
    const condition = normalizeCondition(row.condition)
    const key = `${row.device_id}|${storage}|${condition}`
    const entry = competitorMap.get(key) || {
      trade: [],
      sell: [],
      latest: null,
      competitors: new Set<string>(),
    }
    const tradePrice = Number(row.trade_in_price) || 0
    const sellPrice = Number(row.sell_price) || 0
    if (tradePrice > 0) entry.trade.push(tradePrice)
    if (sellPrice > 0) entry.sell.push(sellPrice)
    entry.latest = row.updated_at || row.scraped_at || entry.latest
    if (row.competitor_name) entry.competitors.add(row.competitor_name)
    competitorMap.set(key, entry)
    comboKeys.add(key)
  }

  const records: Array<Record<string, unknown>> = []

  for (const key of comboKeys) {
    const [deviceId, storage, condition] = key.split('|') as [string, string, TrainingCondition]
    const device = deviceMap.get(deviceId)
    if (!device) continue

    const competitor = competitorMap.get(key)
    const market = marketMap.get(`${deviceId}|${storage}`)
    const conditionScale = CONDITION_MULTIPLIERS[condition]

    const competitorTradeMedian = competitor?.trade.length ? median(competitor.trade) : 0
    const competitorSellMedian = competitor?.sell.length ? median(competitor.sell) : 0
    const marketTradeBase = Number(market?.trade_price) || Number(market?.wholesale_c_stock) || 0
    const marketTrade = marketTradeBase > 0 ? round2(marketTradeBase * conditionScale) : 0
    const marketCpoBase = Number(market?.cpo_price) || Number(market?.marketplace_price) || 0
    const marketCpo = marketCpoBase > 0 ? round2(marketCpoBase * conditionScale) : 0

    const tradeInPrice = competitorTradeMedian || marketTrade || (marketTradeBase > 0 ? round2(marketTradeBase * 0.92 * conditionScale) : 0)
    if (tradeInPrice <= 0) continue

    const wholesalePrice = Number(market?.wholesale_c_stock) > 0
      ? round2(Number(market?.wholesale_c_stock) * conditionScale)
      : round2(tradeInPrice * 0.88)

    const cpoPrice = competitorSellMedian || marketCpo || round2(tradeInPrice * 1.2)
    const retailPrice = round2(Math.max(cpoPrice, competitorSellMedian || 0, (Number(market?.marketplace_price) || 0) * conditionScale))
    const competitorAvgPrice = competitor?.trade.length
      ? round2(competitor.trade.reduce((sum, price) => sum + price, 0) / competitor.trade.length)
      : tradeInPrice

    const signalCount = [
      competitor?.trade.length ? 1 : 0,
      competitor?.sell.length ? 1 : 0,
      market ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0)

    const validationScore = signalCount >= 3 ? 0.99 : signalCount === 2 ? 0.95 : 0.9
    const tradeInMarginPercent = wholesalePrice > 0 ? round2(((tradeInPrice - wholesalePrice) / wholesalePrice) * 100) : 18
    const cpoMarginPercent = cpoPrice > 0 ? round2(((retailPrice - cpoPrice) / cpoPrice) * 100) : 15

    records.push({
      device_id: deviceId,
      device_make: device.make,
      device_model: device.model,
      storage,
      condition,
      carrier: 'Unlocked',
      trade_in_price: tradeInPrice,
      cpo_price: cpoPrice,
      wholesale_price: wholesalePrice,
      retail_price: retailPrice,
      competitor_avg_price: competitorAvgPrice,
      trade_in_margin_percent: tradeInMarginPercent,
      cpo_margin_percent: cpoMarginPercent,
      region: 'NA',
      country_code: 'CA',
      order_type: competitorSellMedian > 0 ? 'cpo' : 'trade_in',
      customer_type: 'retail',
      final_sale_price: competitorSellMedian > 0 ? competitorSellMedian : null,
      days_to_sell: null,
      was_accepted: true,
      source: SOURCE,
      training_date: now.split('T')[0],
      is_validated: true,
      validation_score: validationScore,
      created_at: now,
      updated_at: now,
    })
  }

  const { error: deleteError } = await supabase
    .from('pricing_training_data')
    .delete()
    .eq('source', SOURCE)

  if (deleteError) {
    throw new Error(`Failed to clear previous seed rows: ${deleteError.message}`)
  }

  let inserted = 0
  const batchSize = 500
  for (let index = 0; index < records.length; index += batchSize) {
    const batch = records.slice(index, index + batchSize)
    const { error } = await supabase
      .from('pricing_training_data')
      .insert(batch)
    if (error) {
      throw new Error(`Failed inserting batch ${index / batchSize + 1}: ${error.message}`)
    }
    inserted += batch.length
  }

  console.log(`Device rows: ${devices.length}`)
  console.log(`Competitor rows scanned: ${competitorRows.length}`)
  console.log(`Market rows scanned: ${marketRows.length}`)
  console.log(`Validated training rows inserted: ${inserted}`)
  console.log(`Unique combos seeded: ${records.length}`)
  console.log('')
}

main().catch((error) => {
  console.error('Pricing training seed failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
