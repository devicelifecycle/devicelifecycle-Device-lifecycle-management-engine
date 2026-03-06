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
import { scrapeTelus } from './adapters/telus'
import { scrapeBell } from './adapters/bell'
import { scrapeApple } from './adapters/apple'

const SCRAPERS = [
  { id: 'gorecell', fn: scrapeGoRecell },
  { id: 'telus', fn: scrapeTelus },
  { id: 'bell', fn: scrapeBell },
  { id: 'apple', fn: scrapeApple },
] as const

const DISCOVERY_SCRAPERS = [
  { id: 'gorecell', fn: scrapeGoRecellFullCatalog },
] as const

export interface PipelineResult {
  total_scraped: number
  total_upserted: number
  devices_created?: number
  results: ScraperResult[]
  errors: string[]
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
    // Also run regular scrapers for devices we have (Apple, Bell, Telus)
    let devicesToScrape: DeviceToScrape[] = []
    const { data: catalog } = await supabase
      .from('device_catalog')
      .select('make, model, specifications')
      .eq('is_active', true)
      .in('make', ['Apple', 'Samsung', 'Google'])
      .limit(80)
    for (const d of catalog || []) {
      const spec = (d.specifications || {}) as { storage_options?: string[] }
      const storages = spec.storage_options || ['128GB']
      for (const s of storages.slice(0, 2)) {
        devicesToScrape.push({ make: d.make, model: d.model, storage: s })
      }
    }
    for (const { id, fn } of SCRAPERS) {
      if (id === 'gorecell') continue
      try {
        const result = await fn(devicesToScrape)
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
      const { data: catalog } = await supabase
        .from('device_catalog')
        .select('make, model, specifications')
        .eq('is_active', true)
        .in('make', ['Apple', 'Samsung', 'Google'])
        .limit(100)
      devicesToScrape = []
      for (const d of catalog || []) {
        const spec = (d.specifications || {}) as { storage_options?: string[] }
        const storages = spec.storage_options || ['128GB']
        for (const s of storages.slice(0, 2)) {
          devicesToScrape.push({ make: d.make, model: d.model, storage: s })
        }
      }
    }
    for (const { id, fn } of SCRAPERS) {
      try {
        const result = await fn(devicesToScrape!)
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
  for (const p of allPrices) {
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
      trade_in_price: p.trade_in_price,
      sell_price: p.sell_price ?? null,
      source: 'scraped',
      scraped_at: p.scraped_at,
      updated_at: new Date().toISOString(),
    }

    const { data: existing } = await supabase
      .from('competitor_prices')
      .select('id')
      .eq('device_id', deviceId)
      .eq('storage', p.storage || 'Unknown')
      .eq('competitor_name', p.competitor_name)
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await supabase.from('competitor_prices').update(row).eq('id', existing.id)
      if (!error) upserted++
    } else {
      const { error } = await supabase.from('competitor_prices').insert(row)
      if (!error) upserted++
    }
  }

  return {
    total_scraped: allPrices.filter(p => p.trade_in_price != null).length,
    total_upserted: upserted,
    devices_created: discovery ? devicesCreated : undefined,
    results,
    errors,
  }
}
