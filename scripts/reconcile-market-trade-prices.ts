#!/usr/bin/env npx tsx

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', override: true })
config({ path: '.env', override: true })

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const raw = process.argv.find((arg) => arg.startsWith(prefix))
  return raw ? raw.slice(prefix.length).trim() : undefined
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>
): Promise<T[]> {
  const rows: T[] = []
  const pageSize = 1000

  for (let page = 0; ; page += 1) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await fetchPage(from, to)

    if (error) {
      throw new Error(error.message || 'Failed to fetch paginated rows')
    }

    const batch = data || []
    rows.push(...batch)

    if (batch.length < pageSize) {
      break
    }
  }

  return rows
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const apply = process.argv.includes('--apply')
  const threshold = Number(readArg('threshold') || '0.15')

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const [markets, baselines] = await Promise.all([
    fetchAllRows((from, to) => supabase
      .from('market_prices')
      .select('id, device_id, storage, trade_price, source, updated_at')
      .eq('is_active', true)
      .range(from, to)),
    fetchAllRows((from, to) => supabase
      .from('trained_pricing_baselines')
      .select('device_id, storage, carrier, condition, median_trade_price, last_trained_at')
      .eq('carrier', 'Unlocked')
      .eq('condition', 'good')
      .range(from, to)),
  ])

  const baselineMap = new Map(
    baselines.map((row) => [`${row.device_id}|${row.storage}`, row])
  )

  const candidates = markets
    .map((market) => {
      const baseline = baselineMap.get(`${market.device_id}|${market.storage}`)
      const currentTrade = Number(market.trade_price) || 0
      const baselineTrade = Number(baseline?.median_trade_price) || 0
      const relativeDelta = currentTrade > 0 && baselineTrade > 0
        ? Math.abs(currentTrade - baselineTrade) / baselineTrade
        : null

      return {
        id: market.id,
        device_id: market.device_id,
        storage: market.storage,
        source: market.source,
        current_trade_price: currentTrade || null,
        baseline_trade_price: baselineTrade || null,
        relative_delta: relativeDelta,
      }
    })
    .filter((row) =>
      row.current_trade_price &&
      row.baseline_trade_price &&
      row.relative_delta != null &&
      row.relative_delta >= threshold
    )
    .sort((left, right) => (right.relative_delta || 0) - (left.relative_delta || 0))

  const summary = {
    apply,
    threshold,
    candidates: candidates.length,
    updated: 0,
    sample: candidates.slice(0, 20),
  }

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  for (const candidate of candidates) {
    const { error } = await supabase
      .from('market_prices')
      .update({
        trade_price: round2(candidate.baseline_trade_price || 0),
        source: 'Baseline Sync',
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.id)

    if (error) throw error
    summary.updated += 1
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error('Market trade price reconciliation failed:', error)
  process.exit(1)
})
