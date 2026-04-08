#!/usr/bin/env npx tsx

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { PricingService } from '../src/services/pricing.service'

type CompetitorRow = {
  device_id: string
  storage: string
  condition: 'excellent' | 'good' | 'fair' | 'broken'
  competitor_name: string
  trade_in_price: number
}

const APPROVED = new Set(['Bell', 'Telus', 'GoRecell'])

function conditionToPricing(condition: CompetitorRow['condition']): 'excellent' | 'good' | 'fair' | 'poor' {
  return condition === 'broken' ? 'poor' : condition
}

async function fetchAllRows(url: string, key: string): Promise<CompetitorRow[]> {
  const supabase = createClient(url, key)
  const rows: CompetitorRow[] = []
  const pageSize = 1000

  for (let page = 0; ; page += 1) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('competitor_prices')
      .select('device_id,storage,condition,competitor_name,trade_in_price')
      .not('trade_in_price', 'is', null)
      .gt('trade_in_price', 0)
      .range(from, to)

    if (error) throw new Error(error.message)

    const batch = (data || []) as CompetitorRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }

  return rows
}

async function main() {
  config({ path: '.env.local', override: true })
  config({ path: '.env', override: true })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing env vars')

  if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = url

  const allRows = await fetchAllRows(url, key)
  const approvedRows = allRows.filter((row) => APPROVED.has(row.competitor_name))
  const grouped = new Map<string, CompetitorRow[]>()

  for (const row of approvedRows) {
    const key = `${row.device_id}|${row.storage}|${row.condition}`
    const list = grouped.get(key) || []
    list.push(row)
    grouped.set(key, list)
  }

  const groups = Array.from(grouped.entries())
  const pricingSupabase = createClient(url, key)

  let index = 0
  let aboveHighest = 0
  let aboveAverage = 0
  let success = 0
  let failed = 0
  const top: Array<{
    device_id: string
    storage: string
    condition: string
    highest: number
    average: number
    quote: number
    above_highest: number
    source: string
  }> = []

  async function worker() {
    while (index < groups.length) {
      const currentIndex = index
      index += 1
      const [groupKey, rows] = groups[currentIndex]
      const [device_id, storage, condition] = groupKey.split('|')
      const prices = rows.map((row) => row.trade_in_price)
      const highest = Math.max(...prices)
      const average = prices.reduce((sum, value) => sum + value, 0) / prices.length

      try {
        const result = await PricingService.calculateAdaptivePrice({
          device_id,
          storage,
          carrier: 'Unlocked',
          condition: conditionToPricing(condition as CompetitorRow['condition']),
          quantity: 1,
          risk_mode: 'retail',
        }, pricingSupabase)

        if (!result.success || !result.trade_price || result.trade_price <= 0) {
          failed += 1
          continue
        }

        success += 1
        const aboveHigh = Math.round((result.trade_price - highest) * 100) / 100
        const aboveAvg = Math.round((result.trade_price - average) * 100) / 100
        if (aboveHigh > 0) {
          aboveHighest += 1
          top.push({
            device_id,
            storage,
            condition,
            highest,
            average,
            quote: result.trade_price,
            above_highest: aboveHigh,
            source: result.price_source || 'unknown',
          })
        }
        if (aboveAvg > 0) aboveAverage += 1
      } catch {
        failed += 1
      }
    }
  }

  await Promise.all(Array.from({ length: 8 }, () => worker()))

  top.sort((a, b) => b.above_highest - a.above_highest)

  console.log(JSON.stringify({
    approved_competitor_rows: approvedRows.length,
    approved_groups: groups.length,
    priced_success: success,
    priced_failed: failed,
    quote_above_highest_count: aboveHighest,
    quote_above_highest_rate: groups.length > 0 ? Math.round((aboveHighest / groups.length) * 10000) / 100 : 0,
    quote_above_average_count: aboveAverage,
    quote_above_average_rate: groups.length > 0 ? Math.round((aboveAverage / groups.length) * 10000) / 100 : 0,
    top_over_highest: top.slice(0, 20),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
