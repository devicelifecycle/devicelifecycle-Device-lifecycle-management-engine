/**
 * Standalone GoRecell scraper runner — calls scraper directly, writes to Supabase.
 * Usage: npx tsx scripts/run-gorecell-scraper.ts
 */

// Load env before anything else
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { scrapeGoRecell } from '../src/lib/scrapers/adapters/gorecell'

const SCRAPER_CONDITIONS = ['excellent', 'good', 'fair', 'broken'] as const
type Condition = typeof SCRAPER_CONDITIONS[number]
type DeviceToScrape = { make: string; model: string; storage?: string; condition?: Condition }

function expandDevicesByCondition(devices: DeviceToScrape[]): DeviceToScrape[] {
  const expanded: DeviceToScrape[] = []
  for (const device of devices) {
    if (device.condition) { expanded.push(device); continue }
    for (const condition of SCRAPER_CONDITIONS) expanded.push({ ...device, condition })
  }
  return expanded
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('=== GoRecell Scraper — Targeted Mode ===')
  const start = Date.now()

  // 1. Load all active devices from catalog
  console.log('Loading device catalog...')
  const { data: devices, error: devErr } = await supabase
    .from('device_catalog')
    .select('make, model, specifications')
    .eq('is_active', true)
    .order('make', { ascending: true })

  if (devErr || !devices) {
    console.error('Failed to load catalog:', devErr)
    process.exit(1)
  }
  console.log(`Found ${devices.length} active devices`)

  // 2. Expand to one entry per storage option (same logic as pipeline)
  type CatalogDevice = { make: string; model: string; specifications?: Record<string, unknown> | null }
  const devicesToScrape = expandDevicesByCondition(
    (devices as CatalogDevice[]).flatMap((d: CatalogDevice) => {
      const specs = d.specifications as { storage_options?: string[] } | null
      const storages: string[] = specs?.storage_options?.filter(Boolean) ?? ['128GB']
      return storages.map((storage: string) => ({ make: d.make, model: d.model, storage }))
    })
  )
  console.log(`Expanded to ${devicesToScrape.length} device+storage+condition combinations`)

  // 3. Run GoRecell scraper
  console.log('Running GoRecell scraper...')
  const result = await scrapeGoRecell(devicesToScrape)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`\nScraper finished in ${elapsed}s`)
  console.log(`Success: ${result.success}`)
  console.log(`Prices scraped: ${result.prices.length}`)
  if (result.error) console.log(`Error: ${result.error}`)

  const matchedPrices = result.prices.filter(p => p.trade_in_price != null)
  const nullPrices    = result.prices.filter(p => p.trade_in_price == null)
  console.log(`Matched: ${matchedPrices.length}  |  No match: ${nullPrices.length}`)

  if (matchedPrices.length === 0) {
    console.log('\nNo prices found — nothing to write to database.')
    process.exit(0)
  }

  // 4. Resolve device_ids for each scraped price
  console.log('\nResolving device IDs...')
  type PriceWithId = { device_id: string; competitor_name: string; storage: string; condition: string; trade_in_price: number; sell_price: number | null; scraped_at: string }
  const rows: PriceWithId[] = []

  for (const price of matchedPrices) {
    const { data: device } = await supabase
      .from('device_catalog')
      .select('id')
      .ilike('make', price.make)
      .ilike('model', price.model)
      .limit(1)
      .maybeSingle()

    if (!device?.id) {
      // Auto-create device if missing
      const { data: newDev } = await supabase
        .from('device_catalog')
        .insert({ make: price.make, model: price.model, is_active: true })
        .select('id')
        .single()
      if (!newDev?.id) continue
      rows.push({
        device_id: newDev.id,
        competitor_name: price.competitor_name,
        storage: price.storage ?? '128GB',
        condition: price.condition ?? 'good',
        trade_in_price: price.trade_in_price!,
        sell_price: price.sell_price ?? null,
        scraped_at: price.scraped_at,
      })
    } else {
      rows.push({
        device_id: device.id,
        competitor_name: price.competitor_name,
        storage: price.storage ?? '128GB',
        condition: price.condition ?? 'good',
        trade_in_price: price.trade_in_price!,
        sell_price: price.sell_price ?? null,
        scraped_at: price.scraped_at,
      })
    }
  }

  console.log(`Resolved ${rows.length} rows with device IDs`)

  // 5. Upsert to competitor_prices
  console.log('Writing to competitor_prices...')
  const BATCH = 100
  let upserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error: upsertErr } = await supabase
      .from('competitor_prices')
      .upsert(batch, {
        onConflict: 'device_id,competitor_name,storage,condition',
        ignoreDuplicates: false,
      })
    if (upsertErr) {
      console.error(`Batch ${i}-${i + BATCH} error:`, upsertErr.message)
    } else {
      upserted += batch.length
    }
  }

  console.log(`\n✓ Upserted ${upserted} rows to competitor_prices`)

  // 6. Show sample of what was written
  console.log('\n=== Sample prices written ===')
  const sample = rows
    .filter(r => r.condition === 'good')
    .slice(0, 15)
    .sort((a, b) => a.storage.localeCompare(b.storage))

  for (const r of sample) {
    const { data: dev } = await supabase.from('device_catalog').select('make,model').eq('id', r.device_id).single()
    console.log(`${(dev?.make + ' ' + dev?.model).padEnd(35)} ${r.storage.padEnd(8)} Good: $${r.trade_in_price}`)
  }

  const totalMs = Date.now() - start
  console.log(`\nTotal time: ${(totalMs/1000).toFixed(1)}s`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
