#!/usr/bin/env npx tsx
/**
 * Verify competitor_prices and compare our quotes with competitors.
 * Usage: npm run verify:pricing
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolveComparablePricingDeviceId } from '../src/lib/pricing-device-resolution'
import { PricingService } from '../src/services/pricing.service'

config({ path: '.env.local', override: true })
config({ path: '.env', override: true })

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const raw = process.argv.find((arg) => arg.startsWith(prefix))
  return raw ? raw.slice(prefix.length).trim() : undefined
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing env vars. Add to .env.local:')
    console.error('  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const pricingSupabase = createClient(url, key)
  const SEP = '='.repeat(60)
  const requestedMake = readArg('make')
  const requestedModel = readArg('model')
  const requestedStorage = readArg('storage')
  const requestedCondition = readArg('condition')

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
    .in('setting_key', ['beat_competitor_percent', 'competitor_ceiling_percent', 'prefer_data_driven'])

  const settingsMap = Object.fromEntries((settings || []).map(s => [s.setting_key, s.setting_value]))
  console.log(`  prefer_data_driven: ${settingsMap.prefer_data_driven ?? 'not set (default false)'}`)
  console.log(`  beat_competitor_percent: ${settingsMap.beat_competitor_percent ?? 'not set (default 0)'}`)
  console.log(`  competitor_ceiling_percent: ${settingsMap.competitor_ceiling_percent ?? 'not set (default 0)'}`)

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

  if (requestedMake && requestedModel) {
    const { data: matchingDevices } = await supabase
      .from('device_catalog')
      .select('id, make, model')
      .eq('make', requestedMake)
      .eq('model', requestedModel)
      .eq('is_active', true)

    const candidateIds = (matchingDevices || []).map((device) => device.id)
    if (candidateIds.length === 0) {
      console.log(`  No active device_catalog rows found for ${requestedMake} ${requestedModel}`)
      return
    }

    console.log(`  Requested device: ${requestedMake} ${requestedModel}`)
    console.log(`  Candidate device IDs: ${candidateIds.join(', ')}`)

    const matchingKeys = Array.from(byKey.entries())
      .filter(([key]) => {
        const [candidateDeviceId, storage, condition] = key.split('|')
        if (!candidateIds.includes(candidateDeviceId)) return false
        if (requestedStorage && storage !== requestedStorage) return false
        if (requestedCondition && condition !== requestedCondition) return false
        return true
      })
      .sort((left, right) => right[1].length - left[1].length)

    sampleKey = matchingKeys[0]?.[0] || null
    maxCount = matchingKeys[0]?.[1].length || 0
  } else {
    for (const [k, v] of byKey.entries()) {
      if (v.length > maxCount) {
        maxCount = v.length
        sampleKey = k
      }
    }
  }

  if (!sampleKey || maxCount < 2) {
    console.log('  Need a device with 2+ competitors for comparison. Run scraper to populate.')
    return
  }

  const [deviceId, storage, condition] = sampleKey.split('|')
  const competitorsForDevice = byKey.get(sampleKey)!
  const resolvedDeviceId = await resolveComparablePricingDeviceId(pricingSupabase, deviceId)

  const highest = Math.max(...competitorsForDevice.map(c => c.trade_in_price))
  const avg = competitorsForDevice.reduce((s, c) => s + c.trade_in_price, 0) / competitorsForDevice.length
  const beatPct = parseFloat(settingsMap.beat_competitor_percent || '0')
  const ceilingPct = parseFloat(settingsMap.competitor_ceiling_percent || '0')
  const ourBeatPrice = Math.round(highest * (1 + beatPct / 100) * 100) / 100
  const ceiling = Math.round(highest * (1 + ceilingPct / 100) * 100) / 100

  const { data: device } = await supabase
    .from('device_catalog')
    .select('make, model')
    .eq('id', deviceId)
    .single()

  console.log(`  Device: ${(device?.make ?? '')} ${(device?.model ?? '')} | ${storage} | ${condition}`)
  console.log(`  Quoted device_id: ${deviceId}`)
  console.log(`  Resolved pricing device_id: ${resolvedDeviceId}`)
  console.log('  Competitors:')
  for (const c of competitorsForDevice) {
    console.log(`    - ${c.competitor_name}: $${c.trade_in_price}`)
  }
  console.log(`  Highest: $${highest} | Avg: $${avg.toFixed(2)}`)
  const gorecellRow = competitorsForDevice.find((entry) => entry.competitor_name === 'GoRecell')
  if (gorecellRow) {
    console.log(`  GoRecell exact price: $${gorecellRow.trade_in_price}`)
  }
  console.log(`  Fallback V2 quote if beat=${beatPct}%: $${ourBeatPrice}`)
  console.log(`  Ceiling (top + ${ceilingPct}%): $${ceiling}`)
  console.log(`  → Fallback beat price is ${((ourBeatPrice - highest) / highest * 100).toFixed(1)}% above top competitor`)

  const adaptiveQuote = await PricingService.calculateAdaptivePrice({
    device_id: deviceId,
    storage,
    carrier: 'Unlocked',
    condition: condition as 'new' | 'excellent' | 'good' | 'fair' | 'poor',
    risk_mode: 'retail',
  }, pricingSupabase)

  if (adaptiveQuote.success) {
    console.log(`  Live adaptive quote: $${adaptiveQuote.trade_price}`)
    console.log(`  Live quote source: ${adaptiveQuote.price_source}`)
    if (adaptiveQuote.breakdown?.market_sanity_clamped) {
      console.log(`  Market sanity clamp: yes (from $${adaptiveQuote.breakdown.data_driven_trade_price_before_market_sanity} to $${adaptiveQuote.trade_price})`)
    }
  } else {
    console.log(`  Live adaptive quote failed: ${adaptiveQuote.error ?? 'unknown error'}`)
  }

  if (settingsMap.prefer_data_driven === 'true' || settingsMap.prefer_data_driven === '1') {
    console.log('  Note: prefer_data_driven=true, so live quote generation should use the adaptive/data-driven path before this fallback formula.')
  }

  console.log('\n' + SEP)
  console.log('  4. NEXT STEPS')
  console.log(SEP)
  console.log('  - Run scraper: npm run scrape:prices')
  console.log('  - Test pipeline: npx tsx scripts/test-pricing-pipeline.ts')
  console.log('  - Admin Pricing: keep beat_competitor_percent=0 and competitor_ceiling_percent=0 unless you intentionally want aggressive bidding')
  console.log('  - API: POST /api/pricing/calculate to verify adaptive live quotes on the exact device/condition')
  console.log('')
}

main().catch((err) => {
  console.error('Verify failed:', err)
  process.exit(1)
})
