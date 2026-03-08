// ============================================================================
// PRICE SCRAPER PIPELINE
// ============================================================================
// Orchestrates scrapers, maps results to device_catalog, upserts to competitor_prices
// When run from cron (no user session), pass a service-role client to bypass RLS.

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from './types'
import { scrapeGoRecell, scrapeGoRecellFullCatalog } from './adapters/gorecell'
import { scrapeTelus, scrapeTelusFullCatalog } from './adapters/telus'
import { scrapeBell, scrapeBellFullCatalog } from './adapters/bell'
import { scrapeApple } from './adapters/apple'
import { scrapeUniversal, scrapeUniversalFullCatalog } from './adapters/universal'

const SCRAPERS = [
  { id: 'gorecell', fn: scrapeGoRecell },
  { id: 'telus', fn: scrapeTelus },
  { id: 'bell', fn: scrapeBell },
  { id: 'universal', fn: scrapeUniversal },
  { id: 'apple', fn: scrapeApple },
] as const

const DISCOVERY_SCRAPERS = [
  { id: 'gorecell', fn: scrapeGoRecellFullCatalog },
  { id: 'bell', fn: scrapeBellFullCatalog },
  { id: 'telus', fn: scrapeTelusFullCatalog },
  { id: 'universal', fn: scrapeUniversalFullCatalog },
] as const

const SCRAPER_CONDITIONS: Array<'excellent' | 'good' | 'fair' | 'broken'> = ['excellent', 'good', 'fair', 'broken']

function expandDevicesByCondition(devices: DeviceToScrape[]): DeviceToScrape[] {
  const expanded: DeviceToScrape[] = []
  for (const device of devices) {
    if (device.condition) {
      expanded.push(device)
      continue
    }
    for (const condition of SCRAPER_CONDITIONS) {
      expanded.push({ ...device, condition })
    }
  }
  return expanded
}

export interface PipelineResult {
  total_scraped: number
  total_upserted: number
  devices_created?: number
  results: ScraperResult[]
  errors: string[]
}

function normalizeStorageKey(storage?: string): string {
  return (storage || 'Unknown').trim().toLowerCase()
}

function normalizeModelKey(model?: string): string {
  return (model || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function dedupeScrapedPrices(prices: ScrapedPrice[]): ScrapedPrice[] {
  const map = new Map<string, ScrapedPrice>()

  for (const price of prices) {
    const key = [
      price.competitor_name.toLowerCase(),
      (price.make || '').toLowerCase(),
      normalizeModelKey(price.model),
      normalizeStorageKey(price.storage),
      normalizeCompetitorCondition(price.condition),
    ].join('|')

    const existing = map.get(key)
    if (!existing) {
      map.set(key, price)
      continue
    }

    if (existing.trade_in_price == null && price.trade_in_price != null) {
      map.set(key, price)
      continue
    }

    if (
      existing.trade_in_price != null &&
      price.trade_in_price != null &&
      (price.scraped_at || '') > (existing.scraped_at || '')
    ) {
      map.set(key, price)
    }
  }

  return Array.from(map.values())
}

async function upsertCompetitorPrice(
  supabase: SupabaseClient,
  row: {
    device_id: string
    storage: string
    competitor_name: string
    condition: 'excellent' | 'good' | 'fair' | 'broken'
    trade_in_price: number | null
    sell_price: number | null
    source: string
    scraped_at: string
    updated_at: string
  }
): Promise<{ success: boolean; error?: string }> {
  const { error: upsertError } = await supabase
    .from('competitor_prices')
    .upsert(row, {
      onConflict: 'device_id,storage,competitor_name,condition',
      ignoreDuplicates: false,
    })

  if (!upsertError) return { success: true }

  const code = (upsertError as { code?: string } | null)?.code
  if (code !== '42P10') {
    return { success: false, error: upsertError.message }
  }

  const { data: existing } = await supabase
    .from('competitor_prices')
    .select('id')
    .eq('device_id', row.device_id)
    .eq('storage', row.storage)
    .eq('competitor_name', row.competitor_name)
    .eq('condition', row.condition)
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase.from('competitor_prices').update(row).eq('id', existing.id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  }

  const { error } = await supabase.from('competitor_prices').insert(row)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/** Normalize make/model for matching (e.g. "iPhone 15 Pro" -> "iphone 15 pro") */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Map scraped make+model+storage to device_catalog id */
async function resolveDeviceId(
  supabase: SupabaseClient,
  make: string,
  model: string,
  storage: string
): Promise<string | null> {
  const makeNorm = normalize(make)
  const modelNorm = normalize(model)

  const { data: devices } = await supabase
    .from('device_catalog')
    .select('id, make, model, specifications')
    .eq('is_active', true)
    .ilike('make', make)

  if (!devices?.length) return null

  const storageNorm = normalize(storage).replace(/\s/g, '')
  for (const d of devices) {
    if (normalize(d.model) === modelNorm) {
      const spec = (d.specifications || {}) as { storage_options?: string[] }
      const storages = spec.storage_options || []
      if (storages.length === 0) return d.id
      const storageMatch = storages.some(s => {
        const sNorm = normalize(s).replace(/\s/g, '')
        return sNorm === storageNorm || s.toLowerCase().includes(storage.toLowerCase())
      })
      if (storageMatch) return d.id
    }
  }
  return devices[0]?.id ?? null
}

/** Infer category from make/model */
function inferCategory(make: string, model: string): string {
  const m = (make + ' ' + model).toLowerCase()
  if (m.includes('watch')) return 'watch'
  if (m.includes('ipad') || m.includes('tab') || m.includes('tablet')) return 'tablet'
  if (m.includes('macbook') || m.includes('mac ') || m.includes('imac') || m.includes('laptop')) return 'laptop'
  return 'phone'
}

function normalizeCompetitorCondition(input?: string): 'excellent' | 'good' | 'fair' | 'broken' {
  const value = (input || '').toLowerCase().trim()
  if (value === 'excellent' || value === 'new') return 'excellent'
  if (value === 'fair') return 'fair'
  if (value === 'broken' || value === 'poor') return 'broken'
  return 'good'
}

async function buildScrapeDevicesFromCatalog(supabase: SupabaseClient, limit = 240): Promise<DeviceToScrape[]> {
  const { data: catalog } = await supabase
    .from('device_catalog')
    .select('make, model, category, specifications')
    .eq('is_active', true)
    .limit(limit)

  const devicesToScrape: DeviceToScrape[] = []
  for (const d of catalog || []) {
    const category = (d.category || '').toLowerCase()
    if (category && !['phone', 'tablet', 'watch', 'laptop'].includes(category)) continue
    const spec = (d.specifications || {}) as { storage_options?: string[] }
    const storages = spec.storage_options?.length ? spec.storage_options : ['128GB']
    for (const s of storages.slice(0, 3)) {
      devicesToScrape.push({ make: d.make, model: d.model, storage: s })
    }
  }
  return devicesToScrape
}

/** Create device in catalog if not found; return device_id. Reuses existing make+model. */
async function ensureDevice(supabase: SupabaseClient, make: string, model: string, storage: string): Promise<string> {
  const existing = await resolveDeviceId(supabase, make, model, storage)
  if (existing) return existing

  const makeNorm = normalize(make)
  const modelNorm = normalize(model)
  const { data: devices } = await supabase
    .from('device_catalog')
    .select('id, model, specifications')
    .eq('is_active', true)
    .ilike('make', make)
  for (const d of devices || []) {
    const dm = (d as { model?: string }).model ?? ''
    if (dm && normalize(dm) === modelNorm) {
      const spec = ((d as { specifications?: { storage_options?: string[] } }).specifications || {}) as { storage_options?: string[] }
      const storages = new Set(spec.storage_options || [])
      if (storage && storage !== 'N/A') storages.add(storage)
      if (storages.size > (spec.storage_options?.length || 0)) {
        await supabase.from('device_catalog').update({
          specifications: { ...spec, storage_options: Array.from(storages) },
          updated_at: new Date().toISOString(),
        }).eq('id', d.id)
      }
      return d.id
    }
  }

  const category = inferCategory(make, model)
  const storageOptions = storage && storage !== 'N/A' ? [storage] : ['128GB']
  const { data: created, error } = await supabase
    .from('device_catalog')
    .insert({
      make: make || 'Other',
      model: model || 'Unknown',
      category,
      specifications: { storage_options: storageOptions },
      is_active: true,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create device: ${error.message}`)
  return created.id
}

/**
 * Run full scraper pipeline.
 * @param devices - Optional device list; if omitted, uses discovery mode (scrape all from GoRecell).
 * @param supabaseClient - Optional Supabase client. Pass service-role client for cron (bypasses RLS).
 * @param discovery - If true, scrape full catalog and auto-create devices; ignores devices param.
 */
export async function runScraperPipeline(
  devices?: DeviceToScrape[],
  supabaseClient?: SupabaseClient,
  discovery = true
): Promise<PipelineResult> {
  const supabase = supabaseClient ?? createServerSupabaseClient()
  const errors: string[] = []
  let devicesCreated = 0

  const results: ScraperResult[] = []
  const allPrices: ScrapedPrice[] = []

  if (discovery && (!devices || devices.length === 0)) {
    // Discovery mode: scrape full catalog, auto-create devices
    for (const { id, fn } of DISCOVERY_SCRAPERS) {
      try {
        const result = await (fn as () => Promise<ScraperResult>)()
        results.push(result)
        allPrices.push(...result.prices)
      } catch (e) {
        results.push({
          competitor_name: id,
          prices: [],
          success: false,
          error: e instanceof Error ? e.message : 'Unknown error',
          duration_ms: 0,
        })
        errors.push(`${id}: ${e instanceof Error ? e.message : 'Unknown'}`)
      }
    }
    // Also run regular scrapers for sources without full catalog endpoints (Apple)
    let devicesToScrape: DeviceToScrape[] = await buildScrapeDevicesFromCatalog(supabase, 200)
    const expandedDevices = expandDevicesByCondition(devicesToScrape)
    for (const { id, fn } of SCRAPERS) {
      if (id !== 'apple') continue
      try {
        const result = await fn(expandedDevices)
        results.push(result)
        allPrices.push(...result.prices)
      } catch (e) {
        results.push({
          competitor_name: id,
          prices: [],
          success: false,
          error: e instanceof Error ? e.message : 'Unknown error',
          duration_ms: 0,
        })
      }
    }
  } else {
    let devicesToScrape = devices
    if (!devicesToScrape?.length) {
      devicesToScrape = await buildScrapeDevicesFromCatalog(supabase, 240)
    }
    const expandedDevices = expandDevicesByCondition(devicesToScrape!)
    for (const { id, fn } of SCRAPERS) {
      try {
        const result = await fn(expandedDevices)
        results.push(result)
        allPrices.push(...result.prices)
      } catch (e) {
        results.push({
          competitor_name: id,
          prices: [],
          success: false,
          error: e instanceof Error ? e.message : 'Unknown error',
          duration_ms: 0,
        })
        errors.push(`${id}: ${e instanceof Error ? e.message : 'Unknown'}`)
      }
    }
  }

  let upserted = 0
  const dedupedPrices = dedupeScrapedPrices(allPrices)
  for (const p of dedupedPrices) {
    if (p.trade_in_price == null) continue

    let deviceId: string | null = await resolveDeviceId(supabase, p.make, p.model, p.storage)
    if (!deviceId && discovery) {
      try {
        deviceId = await ensureDevice(supabase, p.make, p.model, p.storage)
        devicesCreated++
      } catch (e) {
        errors.push(`Create device failed: ${p.make} ${p.model} - ${e instanceof Error ? e.message : 'Unknown'}`)
        continue
      }
    }
    if (!deviceId) {
      errors.push(`No device match: ${p.make} ${p.model} ${p.storage}`)
      continue
    }

    const row = {
      device_id: deviceId,
      storage: p.storage || 'Unknown',
      competitor_name: p.competitor_name,
      condition: normalizeCompetitorCondition(p.condition),
      trade_in_price: p.trade_in_price,
      sell_price: p.sell_price ?? null,
      source: 'scraped',
      scraped_at: p.scraped_at,
      updated_at: new Date().toISOString(),
    }

    const result = await upsertCompetitorPrice(supabase, row)
    if (result.success) {
      upserted++
    } else {
      errors.push(
        `Upsert failed: ${p.competitor_name} ${p.make} ${p.model} ${p.storage} ${row.condition} - ${result.error || 'Unknown'}`
      )
    }
  }

  return {
    total_scraped: dedupedPrices.filter(p => p.trade_in_price != null).length,
    total_upserted: upserted,
    devices_created: discovery ? devicesCreated : undefined,
    results,
    errors,
  }
}
