#!/usr/bin/env npx tsx
/**
 * Normalize competitor names in Supabase so aliases do not split pricing signals.
 * Focuses on GoRecell aliases that currently appear as both "Go Resell" and "GoRecell".
 *
 * Usage:
 *   npx tsx scripts/normalize-competitor-names.ts
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { normalizeCompetitorName } from '../src/lib/utils'

config({ path: '.env.local', override: true })
config({ path: '.env', override: true })

type CompetitorRow = {
  id: string
  device_id: string
  storage: string
  condition: 'excellent' | 'good' | 'fair' | 'broken'
  competitor_name: string
  trade_in_price: number | null
  sell_price: number | null
  scraped_at: string | null
  updated_at: string | null
}

function rowTimestamp(row: CompetitorRow): string {
  return row.updated_at || row.scraped_at || ''
}

function preferRow(current: CompetitorRow, candidate: CompetitorRow): CompetitorRow {
  const currentTrade = current.trade_in_price ?? 0
  const candidateTrade = candidate.trade_in_price ?? 0
  if (candidateTrade > currentTrade) return candidate

  const currentSell = current.sell_price ?? 0
  const candidateSell = candidate.sell_price ?? 0
  if (candidateTrade === currentTrade && candidateSell > currentSell) return candidate

  return rowTimestamp(candidate) > rowTimestamp(current) ? candidate : current
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const rows: CompetitorRow[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('competitor_prices')
      .select('id, device_id, storage, condition, competitor_name, trade_in_price, sell_price, scraped_at, updated_at')
      .ilike('competitor_name', 'Go%')
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(`Failed to load competitor rows: ${error.message}`)
    }

    const batch = (data || []) as CompetitorRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }

  const grouped = new Map<string, CompetitorRow>()
  const aliasIds: string[] = []

  for (const row of rows) {
    const canonicalName = normalizeCompetitorName(row.competitor_name)
    const key = `${row.device_id}|${row.storage}|${row.condition}|${canonicalName}`
    const existing = grouped.get(key)
    grouped.set(key, existing ? preferRow(existing, row) : row)

    if (canonicalName !== row.competitor_name) {
      aliasIds.push(row.id)
    }
  }

  const canonicalRows = Array.from(grouped.values()).map((row) => ({
    device_id: row.device_id,
    storage: row.storage,
    condition: row.condition,
    competitor_name: normalizeCompetitorName(row.competitor_name),
    trade_in_price: row.trade_in_price,
    sell_price: row.sell_price,
    source: 'scraped',
    scraped_at: row.scraped_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

  for (let index = 0; index < canonicalRows.length; index += 250) {
    const batch = canonicalRows.slice(index, index + 250)
    const { error } = await supabase
      .from('competitor_prices')
      .upsert(batch, { onConflict: 'device_id,storage,competitor_name,condition' })
    if (error) {
      throw new Error(`Failed to upsert canonical competitor rows: ${error.message}`)
    }
  }

  for (let index = 0; index < aliasIds.length; index += 250) {
    const batch = aliasIds.slice(index, index + 250)
    const { error } = await supabase
      .from('competitor_prices')
      .delete()
      .in('id', batch)
    if (error) {
      throw new Error(`Failed to delete alias competitor rows: ${error.message}`)
    }
  }

  console.log(`Normalized ${canonicalRows.length} canonical GoRecell rows`)
  console.log(`Deleted ${aliasIds.length} alias rows`)
}

main().catch((error) => {
  console.error('Normalization failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
