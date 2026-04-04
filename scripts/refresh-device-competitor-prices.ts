#!/usr/bin/env npx tsx

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { scrapeApple } from '../src/lib/scrapers/adapters/apple'
import { scrapeBell } from '../src/lib/scrapers/adapters/bell'
import { scrapeGoRecell } from '../src/lib/scrapers/adapters/gorecell'
import { scrapeTelus } from '../src/lib/scrapers/adapters/telus'
import { scrapeUniversal } from '../src/lib/scrapers/adapters/universal'
import { PricingService } from '../src/services/pricing.service'
import type { ScraperResult, ScrapedPrice } from '../src/lib/scrapers/types'

config({ path: '.env.local', override: true })
config({ path: '.env', override: true })

type Condition = 'excellent' | 'good' | 'fair' | 'broken'
type ProviderId = 'apple' | 'bell' | 'gorecell' | 'telus' | 'universal'

const CONDITIONS: Condition[] = ['excellent', 'good', 'fair', 'broken']
const PROVIDERS: Array<{
  id: ProviderId
  competitorName: string
  scrape: typeof scrapeApple
}> = [
  { id: 'apple', competitorName: 'Apple Trade-In', scrape: scrapeApple },
  { id: 'bell', competitorName: 'Bell', scrape: scrapeBell },
  { id: 'gorecell', competitorName: 'GoRecell', scrape: scrapeGoRecell },
  { id: 'telus', competitorName: 'Telus', scrape: scrapeTelus },
  { id: 'universal', competitorName: 'UniverCell', scrape: scrapeUniversal },
]

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const raw = process.argv.find((arg) => arg.startsWith(prefix))
  return raw ? raw.slice(prefix.length).trim() : undefined
}

type CatalogDevice = {
  id: string
  make: string
  model: string
  storage: string
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function storageKey(value: string): string {
  return normalizeStorageForDb(value).trim().toUpperCase().replace(/\s+/g, '')
}

function buildLookupKey(make: string, model: string, storage: string, condition: string): string {
  return [
    normalizeKey(make),
    normalizeKey(model),
    storageKey(storage),
    normalizeKey(condition),
  ].join('|')
}

function normalizeStorageForDb(storage?: string): string {
  let s = (storage || '128GB').trim().toUpperCase()
  if (!s) return '128GB'

  const sNoSpaces = s.replace(/\s+/g, '')
  if (/^(GOOD|FAIR|EXCELLENT|LIKENEW|BROKEN|POOR|NEW)$/i.test(sNoSpaces)) return 'DEFAULT'

  if (/RAM|SSD|CPU|GPU|CORE|INTEL|NVIDIA|ALUMINUM|CELLULAR|GPS/i.test(s)) {
    const ssdMatch = s.match(/(\d+)\s*TB\s*SSD/i)
    if (ssdMatch) return `${ssdMatch[1]}TB`

    const ssdGbMatch = s.match(/(\d+)\s*GB\s*SSD/i)
    if (ssdGbMatch) {
      const gb = parseInt(ssdGbMatch[1], 10)
      if (gb === 1024) return '1TB'
      if (gb === 2048) return '2TB'
      if (gb === 4096) return '4TB'
      if (gb === 8192) return '8TB'
      return `${gb}GB`
    }

    const gbMatch = s.match(/(\d+)\s*GB(?!RAM|SSD)/i)
    if (gbMatch) return `${gbMatch[1]}GB`

    return 'DEFAULT'
  }

  s = s.replace(/\(WIFI(?:\+CELLULAR)?\)/i, '')
  s = s.replace(/\s+/g, '')
  if (s === '1024GB') s = '1TB'
  if (s === '2048GB') s = '2TB'
  if (s === '4096GB') s = '4TB'
  if (s === '8192GB') s = '8TB'
  return s
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function expandDevices(devices: CatalogDevice[]) {
  return devices.flatMap((device) =>
    CONDITIONS.map((condition) => ({
      device_id: device.id,
      make: device.make,
      model: device.model,
      storage: device.storage,
      condition,
    }))
  )
}

async function loadCatalogDevices(supabase: ReturnType<typeof createClient>): Promise<CatalogDevice[]> {
  const devices: CatalogDevice[] = []
  const pageSize = 500

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('device_catalog')
      .select('id, make, model, category, specifications')
      .eq('is_active', true)
      .order('make')
      .order('model')
      .range(from, from + pageSize - 1)

    if (error) throw error
    const rows = data || []
    for (const row of rows) {
      const category = String((row as { category?: string | null }).category || '').toLowerCase()
      if (category && !['phone', 'tablet', 'watch', 'laptop'].includes(category)) continue

      const spec = ((row as { specifications?: { storage_options?: string[] } }).specifications || {}) as { storage_options?: string[] }
      const storages = spec.storage_options?.length ? spec.storage_options.slice(0, 3) : ['128GB']
      for (const storage of storages) {
        const normalizedStorage = normalizeStorageForDb(storage)
        devices.push({
          id: (row as { id: string }).id,
          make: (row as { make: string }).make,
          model: (row as { model: string }).model,
          storage: normalizedStorage,
        })
      }
    }

    if (rows.length < pageSize) break
  }
  return devices
}

async function applyProviderResults(
  supabase: ReturnType<typeof createClient>,
  batchDevices: CatalogDevice[],
  providerName: string,
  result: ScraperResult
) {
  const now = new Date().toISOString()
  const requested = expandDevices(batchDevices)
  const lookup = new Map<string, ScrapedPrice>()

  for (const row of result.prices) {
    const key = buildLookupKey(row.make, row.model, row.storage, row.condition || 'good')
    lookup.set(key, row)
  }

  const summary = {
    upserted: 0,
    deleted: 0,
    skipped: 0,
    error: result.error,
    success: result.success,
  }

  const hardFailure = result.prices.length === 0 && !result.success

  for (const requestedRow of requested) {
    const key = buildLookupKey(
      requestedRow.make,
      requestedRow.model,
      requestedRow.storage,
      requestedRow.condition
    )
    const matched = lookup.get(key)

    if (matched && matched.trade_in_price != null && matched.trade_in_price > 0) {
      const row = {
        device_id: requestedRow.device_id,
        storage: requestedRow.storage,
        competitor_name: providerName,
        condition: requestedRow.condition,
        trade_in_price: matched.trade_in_price,
        sell_price: matched.sell_price ?? null,
        source: 'scraped',
        scraped_at: matched.scraped_at || now,
        updated_at: now,
        region: 'NA',
        country_code: 'CA',
      }

      const { error } = await supabase
        .from('competitor_prices')
        .upsert(row, {
          onConflict: 'device_id,storage,competitor_name,condition',
          ignoreDuplicates: false,
        })

      if (error) throw error
      summary.upserted += 1
      continue
    }

    if (hardFailure) {
      summary.skipped += 1
      continue
    }

    const { error } = await supabase
      .from('competitor_prices')
      .delete()
      .eq('device_id', requestedRow.device_id)
      .eq('storage', requestedRow.storage)
      .eq('competitor_name', providerName)
      .eq('condition', requestedRow.condition)

    if (error) throw error
    summary.deleted += 1
  }

  return summary
}

async function refreshSingleDevice(
  supabase: ReturnType<typeof createClient>,
  make: string,
  model: string,
  storage: string
) {
  const normalizedStorage = normalizeStorageForDb(storage)

  const { data: device, error: deviceError } = await supabase
    .from('device_catalog')
    .select('id, make, model, sku')
    .eq('make', make)
    .eq('model', model)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (deviceError) throw deviceError
  if (!device?.id) throw new Error(`Active device not found for ${make} ${model}`)

  const devices = [{ id: device.id, make, model, storage: normalizedStorage }]
  const expanded = expandDevices(devices).map(({ make, model, storage, condition }) => ({
    make,
    model,
    storage,
    condition,
  }))

  const beforeQuote = await PricingService.calculateAdaptivePrice({
    device_id: device.id,
    storage: normalizedStorage,
    carrier: 'Unlocked',
    condition: 'good',
    risk_mode: 'retail',
  }, supabase)

  const scraperResults = await Promise.all(
    PROVIDERS.map(async (provider) => ({
      ...provider,
      result: await provider.scrape(expanded),
    }))
  )
  const summary: Record<string, unknown> = {
    device: { id: device.id, make: device.make, model: device.model, storage: normalizedStorage },
    before_quote: beforeQuote.success ? beforeQuote.trade_price : null,
    providers: {},
  }

  for (const provider of scraperResults) {
    const providerSummary = await applyProviderResults(supabase, devices, provider.competitorName, provider.result)
    const validRows = provider.result.prices.filter((price) => price.trade_in_price != null && (price.trade_in_price || 0) > 0)

    ;(summary.providers as Record<string, unknown>)[provider.competitorName] = {
      success: providerSummary.success,
      matched_conditions: validRows.map((row) => ({
        condition: row.condition,
        trade_in_price: row.trade_in_price,
      })),
      deleted_conditions: CONDITIONS.filter((condition) =>
        !validRows.some((row) => (row.condition || 'good') === condition)
      ),
      upserted: providerSummary.upserted,
      deleted: providerSummary.deleted,
      skipped: providerSummary.skipped,
      error: providerSummary.error,
    }
  }

  const afterQuote = await PricingService.calculateAdaptivePrice({
    device_id: device.id,
    storage: normalizedStorage,
    carrier: 'Unlocked',
    condition: 'good',
    risk_mode: 'retail',
  }, supabase)

  summary.after_quote = afterQuote.success ? afterQuote.trade_price : null
  summary.after_quote_source = afterQuote.success ? afterQuote.price_source : null
  summary.after_competitors = afterQuote.success ? afterQuote.competitors : []

  console.log(JSON.stringify(summary, null, 2))
}

async function refreshEntireCatalog(
  supabase: ReturnType<typeof createClient>,
  batchSize: number,
  startBatch = 1
) {
  const devices = await loadCatalogDevices(supabase)
  const batches = chunk(devices, batchSize)
  const grandSummary: Record<string, { upserted: number; deleted: number; skipped: number; batches: number }> = {}

  console.log(`Refreshing ${devices.length} device/storage entries in ${batches.length} batches (batch size ${batchSize}, starting at batch ${startBatch})`)

  for (let i = Math.max(0, startBatch - 1); i < batches.length; i++) {
    const batch = batches[i]
    const expanded = expandDevices(batch).map(({ make, model, storage, condition }) => ({
      make,
      model,
      storage,
      condition,
    }))

    console.log(`Batch ${i + 1}/${batches.length}: ${batch.length} device/storage entries`)

    const scraperResults = await Promise.all(
      PROVIDERS.map(async (provider) => ({
        ...provider,
        result: await provider.scrape(expanded),
      }))
    )

    for (const provider of scraperResults) {
      const batchSummary = await applyProviderResults(supabase, batch, provider.competitorName, provider.result)
      if (!grandSummary[provider.competitorName]) {
        grandSummary[provider.competitorName] = { upserted: 0, deleted: 0, skipped: 0, batches: 0 }
      }
      grandSummary[provider.competitorName].upserted += batchSummary.upserted
      grandSummary[provider.competitorName].deleted += batchSummary.deleted
      grandSummary[provider.competitorName].skipped += batchSummary.skipped
      grandSummary[provider.competitorName].batches += 1
    }
  }

  console.log(JSON.stringify({
    refreshed_device_storage_entries: devices.length,
    batch_size: batchSize,
    providers: grandSummary,
  }, null, 2))
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const batchSize = Number(readArg('batch-size') || '12')
  const startBatch = Number(readArg('start-batch') || '1')
  const refreshAll = process.argv.includes('--all')

  if (refreshAll) {
    await refreshEntireCatalog(
      supabase,
      Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 12,
      Number.isFinite(startBatch) && startBatch > 0 ? startBatch : 1
    )
    return
  }

  const make = readArg('make')
  const model = readArg('model')
  const storage = readArg('storage')

  if (!make || !model || !storage) {
    throw new Error('Usage: npx tsx scripts/refresh-device-competitor-prices.ts --make=Apple --model=\"iPhone 14\" --storage=128GB OR --all [--batch-size=12] [--start-batch=1]')
  }

  await refreshSingleDevice(supabase, make, model, storage)
}

main().catch((error) => {
  console.error('Device competitor refresh failed:', error)
  process.exit(1)
})
