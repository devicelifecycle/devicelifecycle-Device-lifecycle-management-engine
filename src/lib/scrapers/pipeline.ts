// ============================================================================
// PRICE SCRAPER PIPELINE (Optimized)
// ============================================================================
// Orchestrates scrapers IN PARALLEL, maps results to device_catalog, batch-upserts to competitor_prices.
// When run from cron (no user session), pass a service-role client to bypass RLS.

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveComparablePricingDeviceId } from '@/lib/pricing-device-resolution'
import { normalizeCompetitorName } from '@/lib/utils'
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

export type ScraperProviderId = typeof SCRAPERS[number]['id']

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

/** Normalize storage for DB (e.g. "256 GB" -> "256GB", "1024GB" -> "1TB")
 *  Also strips compound specs (RAM, CPU, GPU, SSD labels) to extract pure capacity */
function normalizeStorageForDb(storage?: string): string {
  let s = (storage || '128GB').trim().toUpperCase()
  if (!s) return '128GB'

  // Reject condition values accidentally placed in storage field
  const sNoSpaces = s.replace(/\s+/g, '')
  if (/^(GOOD|FAIR|EXCELLENT|LIKENEW|BROKEN|POOR|NEW)$/i.test(sNoSpaces)) return 'DEFAULT'

  // Strip compound specs: "8TBSSD|48GBRAM|M5MAX18-CORE|40-COREGPU" -> extract SSD or first GB/TB value
  // Also handles: "INTELCOREULTRA9,32GBRAM,1TBSSD", "256GB 8GB RAM", "GPS+CELLULAR|ALUMINUM",
  //               "512GB NVMe", "1TB M.2", "2TB SSD+16GB RAM"
  if (/RAM|SSD|CPU|GPU|CORE|INTEL|NVIDIA|ALUMINUM|CELLULAR|GPS|NVME|M\.2|EMMC/i.test(s)) {
    // Try to find SSD/NVMe capacity first (most specific for laptops)
    const ssdTbMatch = s.match(/(\d+)\s*TB\s*(SSD|NVMe|M\.2|HDD|eMMC)/i)
    if (ssdTbMatch) return `${ssdTbMatch[1]}TB`
    const ssdGbMatch = s.match(/(\d+)\s*GB\s*(SSD|NVMe|M\.2|HDD|eMMC)/i)
    if (ssdGbMatch) {
      const gb = parseInt(ssdGbMatch[1], 10)
      if (gb === 1024) return '1TB'
      if (gb === 2048) return '2TB'
      return `${gb}GB`
    }
    // Bare NVMe/SSD reference with TB before keyword ("1TB NVMe")
    const tbFirst = s.match(/(\d+)\s*TB(?!\s*RAM)/i)
    if (tbFirst) return `${tbFirst[1]}TB`
    // For watches/tablets with GPS/CELLULAR, try to find a GB value
    const gbMatch = s.match(/(\d+)\s*GB(?!RAM|SSD|NVME|DDR|LPDDR)/i)
    if (gbMatch) return `${gbMatch[1]}GB`
    // If no storage capacity found in compound string, return DEFAULT
    return 'DEFAULT'
  }

  // Handle WiFi/Cellular variants: "256GB(WIFI+CELLULAR)" -> "256GB"
  s = s.replace(/\(WIFI(?:\+CELLULAR)?\)/i, '')

  s = s.replace(/\s+/g, '')
  if (s === '1024GB') s = '1TB'
  if (s === '2048GB') s = '2TB'
  if (s === '4096GB') s = '4TB'
  if (s === '8192GB') s = '8TB'
  return s
}

function normalizeModelKey(model?: string): string {
  return (model || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function dedupeScrapedPrices(prices: ScrapedPrice[]): ScrapedPrice[] {
  const map = new Map<string, ScrapedPrice>()

  for (const price of prices) {
    const key = [
      normalizeCompetitorName(price.competitor_name).toLowerCase(),
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

    // Prefer entry that has both trade_in_price AND sell_price
    const existingHasBoth = existing.trade_in_price != null && existing.sell_price != null
    const newHasBoth = price.trade_in_price != null && price.sell_price != null
    if (newHasBoth && !existingHasBoth) {
      map.set(key, price)
      continue
    }

    // Merge sell_price from newer entry if existing lacks it
    if (existing.sell_price == null && price.sell_price != null) {
      existing.sell_price = price.sell_price
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
      // Keep newer sell_price if available
      if (price.sell_price == null && existing.sell_price != null) {
        price.sell_price = existing.sell_price
      }
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

const MODEL_VARIANT_KEYWORDS = [
  'pro',
  'max',
  'plus',
  'ultra',
  'mini',
  'fe',
  'fold',
  'flip',
  'classic',
  'edge',
  'note',
] as const

function collectModelVariantKeywords(model: string): string[] {
  const normalized = normalize(model)
  return MODEL_VARIANT_KEYWORDS.filter((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(normalized))
}

function hasCompatibleVariantProfile(scrapedModel: string, catalogModel: string): boolean {
  const scrapedVariants = collectModelVariantKeywords(scrapedModel)
  const catalogVariants = collectModelVariantKeywords(catalogModel)

  if (scrapedVariants.length !== catalogVariants.length) {
    return false
  }

  return scrapedVariants.every((keyword) => catalogVariants.includes(keyword))
}

export function isSafeCatalogModelMatch(scrapedModel: string, catalogModel: string): boolean {
  if (scrapedModel === catalogModel) return true

  const scrapedExtendsCatalog = modelTokenMatch(scrapedModel, catalogModel) && scrapedModel !== catalogModel
  const catalogExtendsScraped = modelTokenMatch(catalogModel, scrapedModel) && catalogModel !== scrapedModel

  if (!scrapedExtendsCatalog || catalogExtendsScraped) {
    return false
  }

  return hasCompatibleVariantProfile(scrapedModel, catalogModel)
}

// ============================================================================
// DEVICE ID RESOLUTION WITH CACHE
// ============================================================================

/** Check if scraped model matches catalog model with word-boundary safety */
function modelTokenMatch(scraped: string, catalog: string): boolean {
  if (scraped === catalog) return true
  if (scraped.startsWith(catalog)) {
    const nextChar = scraped[catalog.length]
    return nextChar === ' ' || nextChar === '-' || nextChar === undefined
  }
  return false
}

/** Extract core model identity for fuzzy matching across naming conventions.
 *  e.g. 'MacBook Air 13" (2024)' and 'MacBook Air 13-inch (M3)' both become 'macbook air 13'
 *  e.g. 'iPad Pro 11 (2nd Gen) (2020)' and 'iPad Pro 11-inch (M2)' both become 'ipad pro 11'
 *  e.g. 'Galaxy Watch6 Classic' stays 'galaxy watch6 classic' */
const KNOWN_BRANDS = ['apple', 'samsung', 'google', 'microsoft', 'lenovo', 'dell', 'hp', 'asus', 'acer', 'motorola', 'oneplus', 'sony', 'lg', 'razer']

function coreModelName(model: string): string {
  let m = model.toLowerCase().trim()
  // Normalize unicode quotes
  m = m.replace(/[\u2033\u201c\u201d\u2019"']/g, '')
  // Strip known brand prefixes — scrapers sometimes include brand in model name
  // e.g., "Apple iPhone 15 Pro Max" → "iPhone 15 Pro Max" to match catalog convention
  for (const brand of KNOWN_BRANDS) {
    if (m.startsWith(brand + ' ')) {
      m = m.slice(brand.length + 1)
      break
    }
  }
  // Remove parenthesized suffixes: (2024), (M3), (2nd Gen), (M2 Pro), (Nov 2023), (A1822 | A1823)
  m = m.replace(/\s*\([^)]*\)/g, '')
  // Remove -inch suffix
  m = m.replace(/-inch/g, '')
  // Remove generation suffixes
  m = m.replace(/\b\d+(st|nd|rd|th)\s*(gen(eration)?)?/gi, '')
  // Remove trailing year: "MacBook Air 13 2024" -> "MacBook Air 13"
  m = m.replace(/\s+20\d{2}$/g, '')
  // Collapse whitespace
  m = m.replace(/\s+/g, ' ').trim()
  return m
}

/** Map scraped make+model+storage to device_catalog id */
async function resolveDeviceId(
  supabase: SupabaseClient,
  make: string,
  model: string,
  storage: string
): Promise<string | null> {
  const modelNorm = normalize(model)

  const { data: devices } = await supabase
    .from('device_catalog')
    .select('id, make, model, specifications')
    .eq('is_active', true)
    .ilike('make', make)

  if (!devices?.length) return null

  const storageNorm = normalize(storage).replace(/\s/g, '')
  // Also check alternate forms (1tb ↔ 1024gb)
  const storageAlternates = [storageNorm]
  if (storageNorm === '1tb') storageAlternates.push('1024gb')
  if (storageNorm === '1024gb') storageAlternates.push('1tb')
  if (storageNorm === '2tb') storageAlternates.push('2048gb')
  if (storageNorm === '2048gb') storageAlternates.push('2tb')

  const checkStorage = (d: { specifications?: unknown }) => {
    const spec = (d.specifications || {}) as { storage_options?: string[] }
    const storages = spec.storage_options || []
    if (storages.length === 0) return true // No storage options = match any
    return storages.some((s: string) => {
      const sNorm = normalize(s).replace(/\s/g, '')
      return storageAlternates.some(alt =>
        sNorm === alt || sNorm.includes(alt) || alt.includes(sNorm)
      )
    })
  }

  // Pass 1: Exact or token-prefix match (strict)
  for (const d of devices) {
    const dm = normalize((d as { model?: string }).model ?? '')
    const exactMatch = dm === modelNorm
    const modelMatches = exactMatch || isSafeCatalogModelMatch(modelNorm, dm)
    if (modelMatches && checkStorage(d)) {
      return resolveComparablePricingDeviceId(supabase, d.id)
    }
  }

  // Pass 1.5: Retry Pass 1 with make prefix stripped from scraped model.
  // Handles scrapers that include the brand in the model name
  // e.g., "Apple iPhone 15 Pro Max" → try "iPhone 15 Pro Max" against catalog "iPhone 15 Pro Max"
  const makeNorm = normalize(make)
  if (modelNorm.startsWith(makeNorm + ' ')) {
    const modelNormNoBrand = modelNorm.slice(makeNorm.length + 1)
    if (modelNormNoBrand) {
      for (const d of devices) {
        const dm = normalize((d as { model?: string }).model ?? '')
        const exactMatch = dm === modelNormNoBrand
        const modelMatches = exactMatch || isSafeCatalogModelMatch(modelNormNoBrand, dm)
        if (modelMatches && checkStorage(d)) {
          return resolveComparablePricingDeviceId(supabase, d.id)
        }
      }
    }
  }

  // Pass 2: Core model name match (strips year/chip/generation suffixes + brand prefix)
  // This catches "MacBook Air 13" (2024)" matching "MacBook Air 13-inch (M3)"
  const scrapedCore = coreModelName(model)
  if (scrapedCore.length >= 5) { // Avoid matching very short cores
    for (const d of devices) {
      const catalogCore = coreModelName((d as { model?: string }).model ?? '')
      if (scrapedCore === catalogCore && checkStorage(d)) {
        return resolveComparablePricingDeviceId(supabase, d.id)
      }
    }
  }

  return null
}

/** Cached wrapper for resolveDeviceId — avoids repeated DB queries for same device */
function createDeviceIdResolver(supabase: SupabaseClient) {
  const cache = new Map<string, string | null>()

  return async function resolveDeviceIdCached(
    make: string,
    model: string,
    storage: string
  ): Promise<string | null> {
    const key = `${normalize(make)}|${normalize(model)}|${normalizeStorageKey(storage)}`
    if (cache.has(key)) return cache.get(key)!
    const id = await resolveDeviceId(supabase, make, model, storage)
    cache.set(key, id)
    return id
  }
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

/** Category-aware outlier thresholds — laptops/tablets have higher legitimate prices */
function getOutlierThresholds(make: string, model: string): {
  minTrade: number; maxTrade: number; minSell: number; maxSell: number
} {
  const category = inferCategory(make, model)
  switch (category) {
    case 'laptop':
      return { minTrade: 50, maxTrade: 5000, minSell: 100, maxSell: 8000 }
    case 'tablet':
      return { minTrade: 20, maxTrade: 2500, minSell: 50, maxSell: 4000 }
    case 'watch':
      return { minTrade: 20, maxTrade: 1500, minSell: 50, maxSell: 2500 }
    default: // phone
      return { minTrade: 20, maxTrade: 2000, minSell: 50, maxSell: 3000 }
  }
}

async function buildScrapeDevicesFromCatalog(supabase: SupabaseClient, limit?: number): Promise<DeviceToScrape[]> {
  const devicesToScrape: DeviceToScrape[] = []
  const pageSize = 500
  let fetched = 0

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    let query = supabase
      .from('device_catalog')
      .select('make, model, category, specifications')
      .eq('is_active', true)
      .order('make')
      .order('model')
      .range(from, to)

    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      query = query.limit(Math.max(limit - fetched, 0))
    }

    const { data: catalog, error } = await query
    if (error) throw new Error(error.message)

    const rows = catalog || []
    for (const d of rows) {
      const category = (d.category || '').toLowerCase()
      if (category && !['phone', 'tablet', 'watch', 'laptop'].includes(category)) continue
      const spec = (d.specifications || {}) as { storage_options?: string[] }
      const storages = spec.storage_options?.length ? spec.storage_options : ['128GB']
      for (const s of storages.slice(0, 3)) {
        devicesToScrape.push({ make: d.make, model: d.model, storage: s })
      }
    }

    fetched += rows.length
    if (rows.length < pageSize) break
    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0 && fetched >= limit) break
  }

  return devicesToScrape
}

/** Create device in catalog if not found; return device_id. Reuses existing make+model. */
async function ensureDevice(supabase: SupabaseClient, make: string, model: string, storage: string): Promise<string> {
  const existing = await resolveDeviceId(supabase, make, model, storage)
  if (existing) return existing

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
      return resolveComparablePricingDeviceId(supabase, d.id)
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
  return resolveComparablePricingDeviceId(supabase, created.id)
}

// ============================================================================
// PARALLEL SCRAPER HELPERS
// ============================================================================

async function runScraperSafe(
  id: string,
  fn: () => Promise<ScraperResult>
): Promise<{ id: string; result: ScraperResult }> {
  try {
    const result = await fn()
    return { id, result }
  } catch (e) {
    return {
      id,
      result: {
        competitor_name: id,
        prices: [],
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
        duration_ms: 0,
      },
    }
  }
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Run full scraper pipeline.
 * @param devices - Optional device list; if omitted, uses discovery mode (scrape all).
 * @param supabaseClient - Optional Supabase client. Pass service-role client for cron (bypasses RLS).
 * @param discovery - If true, scrape full catalog and auto-create devices; ignores devices param.
 */
export async function runScraperPipeline(
  devices?: DeviceToScrape[],
  supabaseClient?: SupabaseClient,
  discovery = true,
  providerIds?: ScraperProviderId[]
): Promise<PipelineResult> {
  const supabase = supabaseClient ?? await createServerSupabaseClient()
  const errors: string[] = []
  let devicesCreated = 0
  const resolveDevice = createDeviceIdResolver(supabase)
  const selectedProviders = providerIds && providerIds.length > 0
    ? new Set(providerIds)
    : null

  const results: ScraperResult[] = []
  const allPrices: ScrapedPrice[] = []

  if (discovery && (!devices || devices.length === 0)) {
    // Discovery mode: run all discovery scrapers + Apple IN PARALLEL
    const devicesToScrape = await buildScrapeDevicesFromCatalog(supabase)
    const expandedDevices = expandDevicesByCondition(devicesToScrape)

    const scraperPromises = [
      ...DISCOVERY_SCRAPERS
        .filter(({ id }) => !selectedProviders || selectedProviders.has(id))
        .map(({ id, fn }) =>
        runScraperSafe(id, () => (fn as () => Promise<ScraperResult>)())
        ),
      // Apple doesn't have a discovery mode — run with expanded devices
      ...(!selectedProviders || selectedProviders.has('apple')
        ? [runScraperSafe('apple', () => scrapeApple(expandedDevices))]
        : []),
    ]

    const settled = await Promise.allSettled(scraperPromises)
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const { id, result } = outcome.value
        results.push(result)
        allPrices.push(...result.prices)
        if (!result.success && result.error) {
          errors.push(`${id}: ${result.error}`)
        }
      }
    }
  } else {
    // Non-discovery: run all scrapers IN PARALLEL with device list
    let devicesToScrape = devices
    if (!devicesToScrape?.length) {
      devicesToScrape = await buildScrapeDevicesFromCatalog(supabase)
    }
    const expandedDevices = expandDevicesByCondition(devicesToScrape!)

    const scraperPromises = SCRAPERS
      .filter(({ id }) => !selectedProviders || selectedProviders.has(id))
      .map(({ id, fn }) => runScraperSafe(id, () => fn(expandedDevices)))

    const settled = await Promise.allSettled(scraperPromises)
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const { id, result } = outcome.value
        results.push(result)
        allPrices.push(...result.prices)
        if (!result.success && result.error) {
          errors.push(`${id}: ${result.error}`)
        }
      }
    }
  }

  // Dedupe and prepare rows for batch upsert
  let upserted = 0
  const dedupedPrices = dedupeScrapedPrices(allPrices)
  const BATCH_SIZE = 50
  const batchRows: Array<{
    device_id: string
    storage: string
    competitor_name: string
    condition: 'excellent' | 'good' | 'fair' | 'broken'
    trade_in_price: number | null
    sell_price: number | null
    source: string
    scraped_at: string
    updated_at: string
  }> = []

  for (const p of dedupedPrices) {
    if (p.trade_in_price == null && (p.sell_price == null || p.sell_price <= 0)) continue

    let deviceId: string | null = await resolveDevice(p.make, p.model, p.storage)
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
      continue
    }

    const tradeIn = p.trade_in_price != null && p.trade_in_price > 0 ? p.trade_in_price : null
    const sell = p.sell_price != null && p.sell_price > 0 ? p.sell_price : null
    if (tradeIn == null && sell == null) continue

    // Category-aware outlier filtering
    const { minTrade, maxTrade, minSell, maxSell } = getOutlierThresholds(p.make, p.model)
    if (tradeIn != null && (tradeIn < minTrade || tradeIn > maxTrade)) continue
    if (sell != null && (sell < minSell || sell > maxSell)) continue

    const now = new Date().toISOString()
    batchRows.push({
      device_id: deviceId,
      storage: normalizeStorageForDb(p.storage).slice(0, 50),
      competitor_name: normalizeCompetitorName(p.competitor_name).slice(0, 100),
      condition: normalizeCompetitorCondition(p.condition),
      trade_in_price: tradeIn,
      sell_price: sell,
      source: 'scraped',
      scraped_at: p.scraped_at || now,
      updated_at: now,
    })
  }

  // Dedupe batch rows by conflict key (device_id+storage+competitor+condition)
  // Prevents "ON CONFLICT DO UPDATE cannot affect row a second time" errors
  const seenConflictRows = new Map<string, typeof batchRows[number]>()
  for (const row of batchRows) {
    const key = `${row.device_id}|${row.storage}|${row.competitor_name}|${row.condition}`
    const existing = seenConflictRows.get(key)

    if (!existing) {
      seenConflictRows.set(key, row)
      continue
    }

    const existingTrade = existing.trade_in_price ?? 0
    const rowTrade = row.trade_in_price ?? 0
    const existingSell = existing.sell_price ?? 0
    const rowSell = row.sell_price ?? 0
    const shouldReplace =
      rowTrade > existingTrade ||
      (rowTrade === existingTrade && rowSell > existingSell) ||
      (
        rowTrade === existingTrade &&
        rowSell === existingSell &&
        row.scraped_at > existing.scraped_at
      )

    if (shouldReplace) {
      seenConflictRows.set(key, row)
    }
  }
  const uniqueBatchRows = Array.from(seenConflictRows.values())

  // Batch upsert — fall back to individual on failure
  for (let i = 0; i < uniqueBatchRows.length; i += BATCH_SIZE) {
    const batch = uniqueBatchRows.slice(i, i + BATCH_SIZE)
    const { error: batchError } = await supabase
      .from('competitor_prices')
      .upsert(batch, {
        onConflict: 'device_id,storage,competitor_name,condition',
        ignoreDuplicates: false,
      })

    if (!batchError) {
      upserted += batch.length
    } else {
      // Fall back to individual upserts for this batch
      for (const row of batch) {
        const result = await upsertCompetitorPrice(supabase, row)
        if (result.success) {
          upserted++
        } else {
          errors.push(
            `Upsert failed: ${row.competitor_name} ${row.storage} ${row.condition} - ${result.error || 'Unknown'}`
          )
        }
      }
    }
  }

  return {
    total_scraped: dedupedPrices.filter(p => (p.trade_in_price != null && p.trade_in_price > 0) || (p.sell_price != null && p.sell_price > 0)).length,
    total_upserted: upserted,
    devices_created: discovery ? devicesCreated : undefined,
    results,
    errors,
  }
}
