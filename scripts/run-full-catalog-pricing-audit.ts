#!/usr/bin/env npx tsx

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { PricingService } from '../src/services/pricing.service'

type CompetitorCondition = 'excellent' | 'good' | 'fair' | 'broken'
type PricingCondition = 'new' | 'excellent' | 'good' | 'fair' | 'poor'

type CompetitorRow = {
  device_id: string
  storage: string
  condition: CompetitorCondition
  competitor_name: string
  trade_in_price: number
}

type Grouped = {
  device_id: string
  storage: string
  condition: CompetitorCondition
  prices: Array<{ competitor_name: string; trade_in_price: number }>
}

type AuditRow = {
  device_id: string
  make: string
  model: string
  storage: string
  condition: CompetitorCondition
  competitor_count: number
  highest_competitor: number
  average_competitor: number
  quote: number
  quote_source: string
  above_highest: number
  above_average: number
}

function conditionToPricing(condition: CompetitorCondition): PricingCondition {
  if (condition === 'broken') return 'poor'
  return condition
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function timestampForPath(value = new Date()): string {
  return value.toISOString().replace(/[:.]/g, '-')
}

async function fetchAllCompetitorRows(url: string, key: string): Promise<CompetitorRow[]> {
  const supabase = createClient(url, key)
  const pageSize = 1000
  const rows: CompetitorRow[] = []

  for (let page = 0; ; page++) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('competitor_prices')
      .select('device_id,storage,condition,competitor_name,trade_in_price')
      .not('trade_in_price', 'is', null)
      .gt('trade_in_price', 0)
      .range(from, to)

    if (error) throw new Error(`Failed loading competitor prices page ${page + 1}: ${error.message}`)

    const batch = (data || []) as CompetitorRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }

  return rows
}

async function fetchDeviceMap(url: string, key: string, deviceIds: string[]): Promise<Map<string, { make: string; model: string }>> {
  const supabase = createClient(url, key)
  const result = new Map<string, { make: string; model: string }>()

  const chunkSize = 400
  for (let i = 0; i < deviceIds.length; i += chunkSize) {
    const chunk = deviceIds.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('device_catalog')
      .select('id,make,model')
      .in('id', chunk)

    if (error) throw new Error(`Failed loading device catalog chunk ${i / chunkSize + 1}: ${error.message}`)

    for (const row of data || []) {
      result.set(row.id, { make: row.make || 'Unknown', model: row.model || 'Unknown' })
    }
  }

  return result
}

function toCsv(rows: AuditRow[]): string {
  const header = [
    'device_id',
    'make',
    'model',
    'storage',
    'condition',
    'competitor_count',
    'highest_competitor',
    'average_competitor',
    'quote',
    'quote_source',
    'above_highest',
    'above_average',
  ]

  const body = rows.map((row) => [
    row.device_id,
    row.make,
    row.model,
    row.storage,
    row.condition,
    String(row.competitor_count),
    String(row.highest_competitor),
    String(row.average_competitor),
    String(row.quote),
    row.quote_source,
    String(row.above_highest),
    String(row.above_average),
  ])

  return [header.join(','), ...body.map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
}

async function main() {
  config({ path: '.env.local', override: true })
  config({ path: '.env', override: true })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = supabaseUrl
  }

  const start = Date.now()
  console.log('Loading competitor prices for full catalog...')
  const competitorRows = await fetchAllCompetitorRows(supabaseUrl, serviceRoleKey)
  console.log(`Loaded ${competitorRows.length} competitor price rows`)

  const grouped = new Map<string, Grouped>()
  for (const row of competitorRows) {
    const key = `${row.device_id}|${row.storage}|${row.condition}`
    const current = grouped.get(key)
    if (!current) {
      grouped.set(key, {
        device_id: row.device_id,
        storage: row.storage,
        condition: row.condition,
        prices: [{ competitor_name: row.competitor_name, trade_in_price: row.trade_in_price }],
      })
      continue
    }
    current.prices.push({ competitor_name: row.competitor_name, trade_in_price: row.trade_in_price })
  }

  const groups = Array.from(grouped.values()).filter((group) => group.prices.length > 0)
  const deviceIds = Array.from(new Set(groups.map((group) => group.device_id)))
  console.log(`Grouped into ${groups.length} device/storage/condition keys across ${deviceIds.length} devices`)

  const deviceMap = await fetchDeviceMap(supabaseUrl, serviceRoleKey, deviceIds)
  const pricingSupabase = createClient(supabaseUrl, serviceRoleKey)

  const concurrency = 8
  const results: AuditRow[] = []
  let index = 0
  let successCount = 0
  let failCount = 0

  async function worker() {
    while (index < groups.length) {
      const current = groups[index]
      index += 1

      const highest = Math.max(...current.prices.map((price) => price.trade_in_price))
      const average = current.prices.reduce((sum, price) => sum + price.trade_in_price, 0) / current.prices.length

      try {
        const calc = await PricingService.calculateAdaptivePrice(
          {
            device_id: current.device_id,
            storage: current.storage,
            carrier: 'Unlocked',
            condition: conditionToPricing(current.condition),
            quantity: 1,
            risk_mode: 'retail',
          },
          pricingSupabase
        )

        if (!calc.success || calc.trade_price == null || calc.trade_price <= 0) {
          failCount += 1
          continue
        }

        const info = deviceMap.get(current.device_id) || { make: 'Unknown', model: 'Unknown' }
        const quote = round2(calc.trade_price)

        results.push({
          device_id: current.device_id,
          make: info.make,
          model: info.model,
          storage: current.storage,
          condition: current.condition,
          competitor_count: current.prices.length,
          highest_competitor: round2(highest),
          average_competitor: round2(average),
          quote,
          quote_source: calc.price_source || 'unknown',
          above_highest: round2(quote - highest),
          above_average: round2(quote - average),
        })

        successCount += 1
      } catch {
        failCount += 1
      }

      if ((successCount + failCount) % 200 === 0) {
        console.log(`Progress: ${successCount + failCount}/${groups.length}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const aboveHighest = results.filter((row) => row.above_highest > 0)
  const aboveAverage = results.filter((row) => row.above_average > 0)
  const topOverHighest = [...aboveHighest].sort((a, b) => b.above_highest - a.above_highest).slice(0, 100)

  const summary = {
    generated_at: new Date().toISOString(),
    runtime_seconds: round2((Date.now() - start) / 1000),
    total_competitor_rows: competitorRows.length,
    total_groups: groups.length,
    priced_success: successCount,
    priced_failed: failCount,
    quote_above_highest_count: aboveHighest.length,
    quote_above_highest_rate: groups.length > 0 ? round2((aboveHighest.length / groups.length) * 100) : 0,
    quote_above_average_count: aboveAverage.length,
    quote_above_average_rate: groups.length > 0 ? round2((aboveAverage.length / groups.length) * 100) : 0,
    top_over_highest: topOverHighest,
  }

  const outDir = path.join(process.cwd(), 'artifacts', 'pricing-audit', `full-catalog-${timestampForPath()}`)
  await mkdir(outDir, { recursive: true })

  await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8')
  await writeFile(path.join(outDir, 'all-results.csv'), toCsv(results), 'utf8')

  console.log('\nFull catalog pricing audit complete')
  console.log(`Output: ${outDir}`)
  console.log(`Groups audited: ${groups.length}`)
  console.log(`Above highest competitor: ${aboveHighest.length} (${summary.quote_above_highest_rate}%)`)
  console.log(`Above average competitor: ${aboveAverage.length} (${summary.quote_above_average_rate}%)`)
}

main().catch((error) => {
  console.error('Audit failed:', error)
  process.exit(1)
})
