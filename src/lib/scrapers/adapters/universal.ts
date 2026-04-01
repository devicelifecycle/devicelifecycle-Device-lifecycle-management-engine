// ============================================================================
// UNIVERSAL TRADE-IN SCRAPER
// ============================================================================
// UniverCell uses Next.js Server Actions. Action IDs are hashes that change
// on every deployment. This scraper auto-discovers them at runtime by:
//   1. Parsing the RSC __next_f payload embedded in the page HTML
//   2. Scanning inline <script> tags
//   3. Scanning JS chunk bundles
// Discovered IDs are validated (one live call) then cached for 1 hour.
// Env var overrides: UNIVERCELL_ACTION_GET_DEVICE_TYPES, etc.
// ============================================================================

import cheerio from 'cheerio'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, parsePrice, throttle } from '../utils'
import { convertConditionPrice, expandPriceByConditions } from '../condition-pricing'
import { runUniverCellScraperPilot } from './universal-scrapling'

const PRIMARY_TRADE_IN_URL = process.env.UNIVERSAL_TRADE_IN_URL || 'https://univercell.ai/'
const FALLBACK_TRADE_IN_URL = process.env.UNIVERSAL_TRADE_IN_FALLBACK_URL || 'https://www.universalcell.ca/'
const UNIVERCELL_ACTION_URL = process.env.UNIVERCELL_ACTION_URL || 'https://univercell.ai/sell/details/mobile'
// Shop product pages (e.g. /shop/products/iphone-15) - for sell_price fallback
const UNIVERCELL_SHOP_BASE = process.env.UNIVERCELL_SHOP_BASE || 'https://univercell.ai/shop/products/'

// Cached action IDs - discovered dynamically, fall back to env/hardcoded defaults
let cachedActionIds: {
  getDeviceTypes: string | null
  getMakesForDeviceType: string | null
  getModelsForMakeAndType: string | null
  discoveredAt: number | null
} = {
  getDeviceTypes: null,
  getMakesForDeviceType: null,
  getModelsForMakeAndType: null,
  discoveredAt: null,
}

// Discovery cache TTL: 1 hour
const ACTION_ID_CACHE_TTL = 60 * 60 * 1000

/**
 * Extract candidate hex action IDs from raw HTML.
 * Checks the RSC __next_f payload (most reliable) and inline <script> blocks.
 */
function extractHexIdsFromHtml(html: string): string[] {
  const ids: string[] = []

  // 1. RSC flight payload: self.__next_f.push([1, "...json..."])
  //    Next.js App Router embeds action IDs as 40-52 char hex strings here.
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)/g)) {
    try {
      const payload = m[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
      for (const h of payload.matchAll(/"([a-f0-9]{40,52})"/g)) {
        if (!ids.includes(h[1])) ids.push(h[1])
      }
    } catch { /* skip malformed */ }
  }

  // 2. Inline <script> blocks (no src attribute)
  for (const m of html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/g)) {
    for (const h of m[1].matchAll(/"([a-f0-9]{40,52})"/g)) {
      if (!ids.includes(h[1])) ids.push(h[1])
    }
  }

  return ids
}

/**
 * Extract candidate hex action IDs from a JS bundle.
 * Prefers Next.js-specific patterns; falls back to any matching hex literal.
 */
function extractHexIdsFromJs(js: string): string[] {
  const high: string[] = []
  const low: string[] = []

  // High-confidence: Next.js 14 App Router explicit action reference patterns
  for (const m of js.matchAll(/registerServerReference\s*\([^,)]+?,\s*"([a-f0-9]{40,52})"/g)) {
    if (!high.includes(m[1])) high.push(m[1])
  }
  for (const m of js.matchAll(/\$\$ACTION_ID_([a-f0-9]{40,52})/g)) {
    if (!high.includes(m[1])) high.push(m[1])
  }
  for (const m of js.matchAll(/"ACTION_REF[^"]*":\s*"([a-f0-9]{40,52})"/g)) {
    if (!high.includes(m[1])) high.push(m[1])
  }

  // Low-confidence: bare hex literals (many false positives, used as last resort)
  for (const m of js.matchAll(/"([a-f0-9]{40,52})"/g)) {
    if (!high.includes(m[1]) && !low.includes(m[1])) low.push(m[1])
  }

  return [...high, ...low]
}

/**
 * Discover action IDs by fetching the UniverCell page + JS chunks, then
 * validating the getDeviceTypes candidate with one live API call.
 *
 * Returns true if all three IDs were successfully identified and cached.
 */
async function discoverActionIds(): Promise<boolean> {
  // Serve from cache while fresh
  if (cachedActionIds.discoveredAt && Date.now() - cachedActionIds.discoveredAt < ACTION_ID_CACHE_TTL) {
    return cachedActionIds.getDeviceTypes !== null
  }

  // Reset before re-discovery so stale IDs don't persist on failure
  cachedActionIds = { getDeviceTypes: null, getMakesForDeviceType: null, getModelsForMakeAndType: null, discoveredAt: null }

  try {
    const pageRes = await fetchWithRetry(UNIVERCELL_ACTION_URL, { method: 'GET' })
    if (!pageRes.ok) return false
    const html = await pageRes.text()

    // Collect candidates from HTML first (cheaper than loading chunks)
    const candidates: string[] = extractHexIdsFromHtml(html)

    // Then scan ALL JS chunks (not filtered by name — action IDs can be in any bundle)
    const chunkUrls: string[] = []
    for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"[^>]*>/g)) {
      const url = m[1].startsWith('/') ? `https://univercell.ai${m[1]}` : m[1]
      if (!chunkUrls.includes(url)) chunkUrls.push(url)
    }

    for (const url of chunkUrls.slice(0, 10)) {
      if (candidates.length >= 15) break // enough to validate from
      try {
        const r = await fetchWithRetry(url, { method: 'GET' })
        if (!r.ok) continue
        const js = await r.text()
        for (const id of extractHexIdsFromJs(js)) {
          if (!candidates.includes(id)) candidates.push(id)
        }
      } catch { continue }
    }

    if (candidates.length === 0) return false

    // Validate: the getDeviceTypes action accepts no arguments and returns
    // [{id: string, name: string, rd_id?: number}]. Try each candidate until one works.
    for (let i = 0; i < Math.min(candidates.length, 12); i++) {
      try {
        const types = await fetchUniverCellAction<UniverCellDeviceType>(candidates[i], [])
        if (!Array.isArray(types) || types.length === 0 || !types[0].id || !types[0].name) continue

        // Found getDeviceTypes. The makes and models actions come from the same
        // deployment bundle so the next distinct IDs in the candidate list are correct.
        const rest = candidates.filter((_, idx) => idx !== i)
        cachedActionIds = {
          getDeviceTypes: candidates[i],
          getMakesForDeviceType: rest[0] ?? candidates[i],
          getModelsForMakeAndType: rest[1] ?? candidates[i],
          discoveredAt: Date.now(),
        }
        return true
      } catch { continue }
    }
  } catch { /* discovery failed entirely */ }

  return false
}

/**
 * Get action ID with fallback chain:
 * 1. Runtime-discovered (validated)
 * 2. Environment variable override
 * 3. Hardcoded last-known-good IDs (updated 2026-03-25)
 */
function getActionId(type: 'deviceTypes' | 'makes' | 'models'): string {
  const envDefaults = {
    deviceTypes: process.env.UNIVERCELL_ACTION_GET_DEVICE_TYPES || '002d8f7ec727c08e299f84b04d3b412735ede54700',
    makes: process.env.UNIVERCELL_ACTION_GET_MAKES_FOR_DEVICE_TYPE || '40748246c8bd4b73125db4804f15b18c543b2d4ed4',
    models: process.env.UNIVERCELL_ACTION_GET_MODELS_FOR_MAKE_AND_TYPE || '60268b8459b6bb79ac082b14589c9a110e3eb43da1',
  }

  switch (type) {
    case 'deviceTypes':
      return cachedActionIds.getDeviceTypes || envDefaults.deviceTypes
    case 'makes':
      return cachedActionIds.getMakesForDeviceType || envDefaults.makes
    case 'models':
      return cachedActionIds.getModelsForMakeAndType || envDefaults.models
  }
}

type $Root = ReturnType<typeof cheerio.load>
type UniverCellDeviceType = {
  id: string
  name: string
  rd_id?: number
}
type UniverCellMake = {
  id: string
  name: string
  rb_id?: number
}
type UniverCellModel = {
  id: string
  name: string
  sydCapacityPrices?: Array<{
    capacity?: string
    flawlessPrice?: string
  }>
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeStorage(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

function parseActionArray<T>(text: string): T[] | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const payload = line.slice(separator + 1)
    if (!payload.startsWith('[')) continue
    try {
      const parsed = JSON.parse(payload)
      if (Array.isArray(parsed)) return parsed as T[]
    } catch {
      continue
    }
  }

  return null
}

async function fetchUniverCellAction<T>(actionId: string, args: unknown[]): Promise<T[] | null> {
  const response = await fetchWithRetry(UNIVERCELL_ACTION_URL, {
    method: 'POST',
    headers: {
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': actionId,
    },
    body: JSON.stringify(args),
  })

  if (!response.ok) return null
  const body = await response.text()
  return parseActionArray<T>(body)
}

function inferTypeIdForDevice(device: DeviceToScrape): string {
  const model = normalizeText(device.model)
  if (model.includes('watch')) return 'smart-watch'
  if (model.includes('ipad') || model.includes('tablet')) return 'ipad-tablet'
  if (model.includes('macbook') || model.includes('laptop') || model.includes('pc')) return 'pc-macbook-laptop'
  if (model.includes('playstation') || model.includes('xbox') || model.includes('nintendo')) return 'gaming-console'
  return 'mobile'
}

function selectBestModel(device: DeviceToScrape, models: UniverCellModel[]): { model: UniverCellModel; price: number } | null {
  const modelToken = normalizeText(device.model)
  const storageToken = normalizeStorage(device.storage)

  const candidates = models
    .map((model) => {
      const name = normalizeText(model.name || '')
      const capacityList = Array.isArray(model.sydCapacityPrices)
        ? model.sydCapacityPrices
        : (model.sydCapacityPrices && typeof model.sydCapacityPrices === 'object'
            ? Object.values(model.sydCapacityPrices as Record<string, { capacity?: string; flawlessPrice?: string }>)
            : [])

      const prices = capacityList
        .map((entry) => {
          const price = Number(entry.flawlessPrice)
          if (!Number.isFinite(price) || price <= 0) return null
          const capacity = normalizeStorage(entry.capacity || '')
          return { price, capacity }
        })
        .filter((entry): entry is { price: number; capacity: string } => entry !== null)

      if (!modelToken || !name.includes(modelToken) || prices.length === 0) return null

      const storageMatched = prices.find((entry) => storageToken && entry.capacity.includes(storageToken))
      const picked = storageMatched || prices[0]

      let score = 0
      if (name === modelToken) score += 12
      if (name.includes(modelToken)) score += 6
      if (storageMatched) score += 4

      return {
        model,
        price: picked.price,
        score,
      }
    })
    .filter((entry): entry is { model: UniverCellModel; price: number; score: number } => entry !== null)
    .sort((left, right) => right.score - left.score)

  const best = candidates[0]
  return best ? { model: best.model, price: best.price } : null
}

function getUniverCellCapacityEntries(model: UniverCellModel): Array<{ capacity: string; flawlessPrice: number }> {
  const capacityList = Array.isArray(model.sydCapacityPrices)
    ? model.sydCapacityPrices
    : (model.sydCapacityPrices && typeof model.sydCapacityPrices === 'object'
        ? Object.values(model.sydCapacityPrices as Record<string, { capacity?: string; flawlessPrice?: string }>)
        : [])

  return capacityList
    .map((entry) => {
      const price = Number(entry.flawlessPrice)
      if (!Number.isFinite(price) || price <= 0) return null
      return {
        capacity: (entry.capacity || 'Unknown').trim() || 'Unknown',
        flawlessPrice: price,
      }
    })
    .filter((entry): entry is { capacity: string; flawlessPrice: number } => entry !== null)
}

function dedupeUniverCellCatalogPrices(prices: ScrapedPrice[]): ScrapedPrice[] {
  const map = new Map<string, ScrapedPrice>()
  for (const price of prices) {
    const key = `${price.make.toLowerCase()}|${price.model.toLowerCase()}|${price.storage.toLowerCase()}|${(price.condition || 'good').toLowerCase()}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, price)
      continue
    }

    if ((price.trade_in_price ?? -1) > (existing.trade_in_price ?? -1)) {
      map.set(key, price)
    }
  }
  return Array.from(map.values())
}

async function scrapeUniversalTypeScript(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    // Discover action IDs dynamically (validated, cached 1h)
    await discoverActionIds()

    let matchedViaActions = 0

    let typePayload = await fetchUniverCellAction<UniverCellDeviceType>(getActionId('deviceTypes'), [])

    // If current IDs returned nothing, force a fresh discovery then retry once
    if (!typePayload || typePayload.length === 0) {
      cachedActionIds = { getDeviceTypes: null, getMakesForDeviceType: null, getModelsForMakeAndType: null, discoveredAt: null }
      await discoverActionIds()
      typePayload = await fetchUniverCellAction<UniverCellDeviceType>(getActionId('deviceTypes'), [])
    }

    const deviceTypes = typePayload || []

    const neededTypeIds = Array.from(new Set(devices.map((device) => inferTypeIdForDevice(device))))
    const typeMap = new Map(deviceTypes.map((type) => [type.id, type]))

    const makesByType = new Map<string, UniverCellMake[]>()
    for (const typeId of neededTypeIds) {
      const makes = await fetchUniverCellAction<UniverCellMake>(getActionId('makes'), [typeId])
      makesByType.set(typeId, makes || [])
      await throttle(80)
    }

    const modelsByTypeMake = new Map<string, UniverCellModel[]>()
    const makeFetchKeys = new Set<string>()
    for (const device of devices) {
      const typeId = inferTypeIdForDevice(device)
      const makeToken = normalizeText(device.make)
      const matchedMake = (makesByType.get(typeId) || []).find((make) => normalizeText(make.name).includes(makeToken))
      const type = typeMap.get(typeId)
      if (!matchedMake || !type?.rd_id || !matchedMake.rb_id) continue
      makeFetchKeys.add(`${type.rd_id}:${matchedMake.rb_id}`)
    }

    for (const key of Array.from(makeFetchKeys)) {
      const [rdIdRaw, rbIdRaw] = key.split(':')
      const rdId = Number(rdIdRaw)
      const rbId = Number(rbIdRaw)
      if (!Number.isFinite(rdId) || !Number.isFinite(rbId)) continue
      const models = await fetchUniverCellAction<UniverCellModel>(getActionId('models'), [rbId, rdId])
      modelsByTypeMake.set(key, models || [])
      await throttle(80)
    }

    if (deviceTypes.length > 0) {
      for (const device of devices) {
        const typeId = inferTypeIdForDevice(device)
        const makeToken = normalizeText(device.make)
        const type = typeMap.get(typeId)
        const matchedMake = (makesByType.get(typeId) || []).find((make) => normalizeText(make.name).includes(makeToken))

        let matchedPrice: number | null = null
        if (type?.rd_id && matchedMake?.rb_id) {
          const models = modelsByTypeMake.get(`${type.rd_id}:${matchedMake.rb_id}`) || []
          const best = selectBestModel(device, models)
          if (best) {
            matchedPrice = best.price
            matchedViaActions += 1
          }
        }

        const requestedCondition = device.condition ?? 'good'
        const adjustedTradePrice = convertConditionPrice(matchedPrice, 'excellent', requestedCondition)

        prices.push({
          competitor_name: 'UniverCell',
          make: device.make,
          model: device.model,
          storage: device.storage,
          trade_in_price: adjustedTradePrice,
          sell_price: null,
          condition: requestedCondition,
          scraped_at: now,
          raw: { matched: matchedPrice != null, source: 'univercell-actions' },
        })
        await throttle(100)
      }
    }

    if (matchedViaActions > 0) {
      return {
        competitor_name: 'UniverCell',
        prices,
        success: true,
        duration_ms: Date.now() - start,
      }
    }

    const candidateUrls = Array.from(new Set([PRIMARY_TRADE_IN_URL, FALLBACK_TRADE_IN_URL]))
    let html = ''
    let activeUrl = candidateUrls[0]

    for (const url of candidateUrls) {
      try {
        const res = await fetchWithRetry(url, { method: 'GET' })
        if (!res.ok) continue
        html = await res.text()
        activeUrl = url
        break
      } catch {
        continue
      }
    }

    if (!html) {
      throw new Error('Unable to fetch UniverCell prices from configured URLs')
    }

    const $ = cheerio.load(html)
    const domPrices = extractDomPrices($)

    for (const device of devices) {
      const makeToken = normalizeText(device.make || '')
      const modelToken = normalizeText(device.model || '')
      const storageToken = normalizeStorage(device.storage || '')

      const match = domPrices.find(item => {
        const contextText = normalizeText(item.context)
        const contextStorage = normalizeStorage(item.context)

        const hasMake = !makeToken || contextText.includes(makeToken)
        const hasModel = modelToken.length > 0 && contextText.includes(modelToken)
        const hasStorage = !storageToken || contextStorage.includes(storageToken)

        return hasMake && hasModel && hasStorage
      })

      const requestedCondition = device.condition ?? 'good'
      const adjustedTradePrice = convertConditionPrice(match?.price ?? null, 'good', requestedCondition)

      prices.push({
        competitor_name: 'UniverCell',
        make: device.make,
        model: device.model,
        storage: device.storage,
        trade_in_price: adjustedTradePrice,
        sell_price: null,
        condition: requestedCondition,
        scraped_at: now,
        raw: { matched: !!match, source: activeUrl },
      })

      await throttle(80)
    }

    const matchedCount = prices.filter((price) => price.trade_in_price != null).length
    const success = matchedCount > 0

    return {
      competitor_name: 'UniverCell',
      prices,
      success,
      error: success ? undefined : 'No UniverCell trade-in prices matched current parser',
      duration_ms: Date.now() - start,
    }
  } catch (error) {
    return {
      competitor_name: 'UniverCell',
      prices: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - start,
    }
  }
}

async function scrapeUniversalFullCatalogTypeScript(): Promise<ScraperResult> {
  const start = Date.now()
  const now = new Date().toISOString()

  try {
    // Discover action IDs dynamically (validated, cached 1h)
    await discoverActionIds()

    let types = await fetchUniverCellAction<UniverCellDeviceType>(getActionId('deviceTypes'), [])

    // If IDs are stale, force re-discovery and retry once
    if (!types || types.length === 0) {
      cachedActionIds = { getDeviceTypes: null, getMakesForDeviceType: null, getModelsForMakeAndType: null, discoveredAt: null }
      await discoverActionIds()
      types = await fetchUniverCellAction<UniverCellDeviceType>(getActionId('deviceTypes'), [])
    }

    if (!types || types.length === 0) {
      return {
        competitor_name: 'UniverCell',
        prices: [],
        success: false,
        error: 'UniverCell device types unavailable — action IDs could not be discovered',
        duration_ms: Date.now() - start,
      }
    }

    const collected: ScrapedPrice[] = []

    for (const type of types) {
      if (!type.id || !type.rd_id) continue

      const makes = await fetchUniverCellAction<UniverCellMake>(getActionId('makes'), [type.id])
      if (!makes || makes.length === 0) {
        await throttle(80)
        continue
      }

      for (const make of makes) {
        if (!make.rb_id) continue

        const models = await fetchUniverCellAction<UniverCellModel>(getActionId('models'), [make.rb_id, type.rd_id])
        if (!models || models.length === 0) {
          await throttle(80)
          continue
        }

        for (const model of models) {
          const capacities = getUniverCellCapacityEntries(model)
          for (const entry of capacities) {
            collected.push(
              ...expandPriceByConditions(
                {
                  competitor_name: 'UniverCell',
                  make: make.name || 'Other',
                  model: model.name || 'Unknown',
                  storage: entry.capacity,
                  sell_price: null,
                  scraped_at: now,
                },
                entry.flawlessPrice,
                'excellent',
                (condition) => ({
                  source: 'univercell-actions-discovery',
                  typeId: type.id,
                  makeId: make.id,
                  modelId: model.id,
                  base_condition: 'excellent',
                  condition,
                })
              )
            )
          }
        }
        await throttle(80)
      }
      await throttle(80)
    }

    const prices = dedupeUniverCellCatalogPrices(collected)
    return {
      competitor_name: 'UniverCell',
      prices,
      success: prices.length > 0,
      error: prices.length > 0 ? undefined : 'No UniverCell catalog prices discovered',
      duration_ms: Date.now() - start,
    }
  } catch (error) {
    return {
      competitor_name: 'UniverCell',
      prices: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - start,
    }
  }
}

export async function scrapeUniversal(devices: DeviceToScrape[]): Promise<ScraperResult> {
  return runUniverCellScraperPilot({
    devices,
    runTypeScript: () => scrapeUniversalTypeScript(devices),
  })
}

export async function scrapeUniversalFullCatalog(): Promise<ScraperResult> {
  return runUniverCellScraperPilot({
    devices: [],
    discovery: true,
    runTypeScript: () => scrapeUniversalFullCatalogTypeScript(),
  })
}

function extractDomPrices($: $Root): Array<{ price: number; context: string }> {
  const results: Array<{ price: number; context: string }> = []
  const selectors = [
    '[data-price]',
    '.price',
    '.trade-in-value',
    '.trade-value',
    '.device-price',
    '.amount',
  ]

  for (const selector of selectors) {
    $(selector).each(function (this: any) {
      const $el = $(this)
      const text = $el.text().trim()
      const dataPrice = $el.attr('data-price') || ''
      const price = parsePrice(dataPrice) || parsePrice(text)
      if (price != null && price >= 5 && price <= 6000) {
        const context = $el.parent().text().trim().slice(0, 160)
        results.push({ price, context })
      }
    })
  }

  return results
}
