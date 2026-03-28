#!/usr/bin/env npx tsx
/**
 * Verify competitor_prices and compare our quotes with competitors.
 * Usage: npm run verify:pricing
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', override: true })
config({ path: '.env', override: true })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing env vars. Add to .env.local:')
    console.error('  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const SEP = '='.repeat(60)

  console.log('\n' + SEP)
  console.log('  1. COMPETITOR_PRICES OVERVIEW')
  console.log(SEP)

  const { count: totalCp } = await supabase
    .from('competitor_prices')
    .select('*', { count: 'exact', head: true })

  console.log(`  Total competitor_prices: ${totalCp ?? 0}`)

  const { data: byCompetitor } = await supabase
    .from('competitor_prices')
    .select('competitor_name')
  const competitors = [...new Set((byCompetitor || []).map(r => r.competitor_name))].sort()
  console.log(`  Competitors: ${competitors.join(', ')}`)

  const { data: sampleCp } = await supabase
    .from('competitor_prices')
    .select('device_id, storage, condition, competitor_name, trade_in_price, sell_price, updated_at, device:device_catalog(make, model)')
    .not('trade_in_price', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (sampleCp && sampleCp.length > 0) {
    console.log('\n  Sample rows (latest):')
    for (const r of sampleCp.slice(0, 5)) {
      const device = (r as { device?: { make?: string; model?: string } }).device
      const name = device ? `${device.make} ${device.model}` : r.device_id
      console.log(`    ${name} ${r.storage} ${r.condition} | ${r.competitor_name}: $${r.trade_in_price}`)
    }
  }

  console.log('\n' + SEP)
  console.log('  2. PRICING SETTINGS (beat/ceiling)')
  console.log(SEP)

  const { data: settings } = await supabase
    .from('pricing_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['beat_competitor_percent', 'competitor_ceiling_percent'])

  const settingsMap = Object.fromEntries((settings || []).map(s => [s.setting_key, s.setting_value]))
  console.log(`  beat_competitor_percent: ${settingsMap.beat_competitor_percent ?? 'not set (default 2)'}`)
  console.log(`  competitor_ceiling_percent: ${settingsMap.competitor_ceiling_percent ?? 'not set (default 2)'}`)

  console.log('\n' + SEP)
  console.log('  3. QUOTE VS COMPETITOR (sample device)')
  console.log(SEP)

  const { data: grouped } = await supabase
    .from('competitor_prices')
    .select('device_id, storage, condition, trade_in_price, competitor_name')
    .not('trade_in_price', 'is', null)
    .gt('trade_in_price', 0)

  if (!grouped || grouped.length === 0) {
    console.log('  No competitor data — run scrape first: npm run scrape:prices')
    return
  }

  const byKey = new Map<string, Array<{ competitor_name: string; trade_in_price: number }>>()
  for (const r of grouped) {
    const key = `${r.device_id}|${r.storage}|${r.condition}`
    const list = byKey.get(key) || []
    list.push({ competitor_name: r.competitor_name, trade_in_price: r.trade_in_price })
    byKey.set(key, list)
  }

  let sampleKey: string | null = null
  let maxCount = 0
  for (const [k, v] of byKey.entries()) {
    if (v.length > maxCount) {
      maxCount = v.length
      sampleKey = k
    }
  }

  if (!sampleKey || maxCount < 2) {
    console.log('  Need a device with 2+ competitors for comparison. Run scraper to populate.')
    return
  }

  const [deviceId, storage, condition] = sampleKey.split('|')
  const competitorsForDevice = byKey.get(sampleKey)!

  const highest = Math.max(...competitorsForDevice.map(c => c.trade_in_price))
  const avg = competitorsForDevice.reduce((s, c) => s + c.trade_in_price, 0) / competitorsForDevice.length
  const beatPct = parseFloat(settingsMap.beat_competitor_percent || '2')
  const ceilingPct = parseFloat(settingsMap.competitor_ceiling_percent || '2')
  const ourBeatPrice = Math.round(highest * (1 + beatPct / 100) * 100) / 100
  const ceiling = Math.round(highest * (1 + ceilingPct / 100) * 100) / 100

  const { data: device } = await supabase
    .from('device_catalog')
    .select('make, model')
    .eq('id', deviceId)
    .single()

  console.log(`  Device: ${(device?.make ?? '')} ${(device?.model ?? '')} | ${storage} | ${condition}`)
  console.log('  Competitors:')
  for (const c of competitorsForDevice) {
    console.log(`    - ${c.competitor_name}: $${c.trade_in_price}`)
  }
  console.log(`  Highest: $${highest} | Avg: $${avg.toFixed(2)}`)
  console.log(`  Our quote (beat ${beatPct}%): $${ourBeatPrice}`)
  console.log(`  Ceiling (top + ${ceilingPct}%): $${ceiling}`)
  console.log(`  → Our beat price is ${((ourBeatPrice - highest) / highest * 100).toFixed(1)}% above top competitor`)

  console.log('\n' + SEP)
  console.log('  4. NEXT STEPS')
  console.log(SEP)
  console.log('  - Run scraper: npm run scrape:prices')
  console.log('  - Test pipeline: npx tsx scripts/test-pricing-pipeline.ts')
  console.log('  - Admin Pricing: tune beat_competitor_percent (2-5) and competitor_ceiling_percent (2)')
  console.log('  - API: POST /api/pricing/calculate with version=v2 for live quotes')
  console.log('')
}

main().catch((err) => {
  console.error('Verify failed:', err)
  process.exit(1)
})
