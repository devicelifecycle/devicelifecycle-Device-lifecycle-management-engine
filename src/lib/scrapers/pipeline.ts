// ============================================================================
// PRICE SCRAPER PIPELINE
// ============================================================================
// Orchestrates scrapers, maps results to device_catalog, upserts to competitor_prices

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from './types'
import { scrapeGoRecell } from './adapters/gorecell'
import { scrapeTelus } from './adapters/telus'
import { scrapeBell } from './adapters/bell'
import { scrapeApple } from './adapters/apple'

const SCRAPERS = [
  { id: 'gorecell', fn: scrapeGoRecell },
  { id: 'telus', fn: scrapeTelus },
  { id: 'bell', fn: scrapeBell },
  { id: 'apple', fn: scrapeApple },
] as const

export interface PipelineResult {
  total_scraped: number
  total_upserted: number
  results: ScraperResult[]
  errors: string[]
}

/** Normalize make/model for matching (e.g. "iPhone 15 Pro" -> "iphone 15 pro") */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Map scraped make+model+storage to device_catalog id */
async function resolveDeviceId(
  make: string,
  model: string,
  storage: string
): Promise<string | null> {
  const supabase = createServerSupabaseClient()
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

/** Run full scraper pipeline */
export async function runScraperPipeline(
  devices?: DeviceToScrape[]
): Promise<PipelineResult> {
  const supabase = createServerSupabaseClient()
  const errors: string[] = []

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

  const results: ScraperResult[] = []
  const allPrices: ScrapedPrice[] = []

  for (const { id, fn } of SCRAPERS) {
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
      errors.push(`${id}: ${e instanceof Error ? e.message : 'Unknown'}`)
    }
  }

  let upserted = 0
  for (const p of allPrices) {
    if (p.trade_in_price == null) continue

    const deviceId = await resolveDeviceId(p.make, p.model, p.storage)
    if (!deviceId) {
      errors.push(`No device match: ${p.make} ${p.model} ${p.storage}`)
      continue
    }

    const row = {
      device_id: deviceId,
      storage: p.storage,
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
      .eq('storage', p.storage)
      .eq('competitor_name', p.competitor_name)
      .limit(1)
      .single()

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
    results,
    errors,
  }
}
