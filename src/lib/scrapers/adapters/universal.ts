// ============================================================================
// UNIVERSAL TRADE-IN SCRAPER
// ============================================================================
// UniverCell uses Next.js Server Actions which have dynamic action IDs that
// change with each deployment. This scraper attempts to discover action IDs
// dynamically by parsing the page HTML and JS chunks.
// 
// HOW TO MANUALLY UPDATE ACTION IDS:
// 1. Open https://univercell.ai/sell/details/mobile in Chrome DevTools
// 2. Go to Network tab, select a device make (like Apple)
// 3. Look for POST requests to /sell/details/mobile
// 4. Find the "Next-Action" header in the request headers
// 5. Update environment variables:
//    - UNIVERCELL_ACTION_GET_DEVICE_TYPES (first action when page loads)
//    - UNIVERCELL_ACTION_GET_MAKES_FOR_DEVICE_TYPE (when selecting device type)
//    - UNIVERCELL_ACTION_GET_MODELS_FOR_MAKE_AND_TYPE (when selecting make)
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

// Cached action IDs - will be discovered dynamically or fall back to env/defaults
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
 * Attempt to discover action IDs from the UniverCell page JS chunks.
 * Next.js Server Actions have IDs embedded in the page/chunk bundles.
 */
async function discoverActionIds(): Promise<boolean> {
  // Check cache
  if (cachedActionIds.discoveredAt && Date.now() - cachedActionIds.discoveredAt < ACTION_ID_CACHE_TTL) {
    return cachedActionIds.getDeviceTypes !== null
  }

  try {
    // Fetch the sell details page
    const pageRes = await fetchWithRetry(UNIVERCELL_ACTION_URL, { method: 'GET' })
    if (!pageRes.ok) return false
    const html = await pageRes.text()

    // Extract JS chunk URLs
    const chunkMatches = Array.from(html.matchAll(/<script[^>]*src="([^"]*chunks[^"]*)"[^>]*>/g))
    const chunkUrls: string[] = []
    for (const match of chunkMatches) {
      if (match[1].includes('sell') || match[1].includes('details')) {
        chunkUrls.push(match[1].startsWith('/') ? `https://univercell.ai${match[1]}` : match[1])
      }
    }

    // Fetch and parse JS chunks to find action IDs
    for (const chunkUrl of chunkUrls.slice(0, 5)) {
      try {
        const chunkRes = await fetchWithRetry(chunkUrl, { method: 'GET' })
        if (!chunkRes.ok) continue
        const chunkJs = await chunkRes.text()

        // Look for action ID patterns in the bundled JS
        // Next.js 14+ uses patterns like: $$ACTION_ID_xxx or $ACTION$xxx
        const actionIdMatches = Array.from(chunkJs.matchAll(/\$\$ACTION[_$]ID[_$]?([a-f0-9]{32,50})/gi))
        const foundIds: string[] = []
        for (const m of actionIdMatches) {
          foundIds.push(m[1])
        }

        // Also try to find direct action references
        const directMatches = Array.from(chunkJs.matchAll(/"([a-f0-9]{40,50})"/g))
        for (const m of directMatches) {
          if (!foundIds.includes(m[1])) {
            foundIds.push(m[1])
          }
        }

        if (foundIds.length >= 3) {
          // Assume order: getDeviceTypes, getMakes, getModels
          cachedActionIds = {
            getDeviceTypes: foundIds[0],
            getMakesForDeviceType: foundIds[1],
            getModelsForMakeAndType: foundIds[2],
            discoveredAt: Date.now(),
          }
          return true
        }
      } catch {
        continue
      }
    }
  } catch {
    // Discovery failed
  }

  return false
}

/**
 * Get action ID with fallback to environment variable or default
 */
function getActionId(type: 'deviceTypes' | 'makes' | 'models'): string {
  // Updated action IDs as of March 25, 2026 from live browser discovery.
  // If these stop working, run: npx tsx scripts/discover-univercell-actions.ts
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
    // Try to discover action IDs dynamically
    await discoverActionIds()
    
    let matchedViaActions = 0

    const typePayload = await fetchUniverCellAction<UniverCellDeviceType>(getActionId('deviceTypes'), [])
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
    // Try to discover action IDs dynamically
    await discoverActionIds()
    
    const types = await fetchUniverCellAction<UniverCellDeviceType>(getActionId('deviceTypes'), [])
    if (!types || types.length === 0) {
      return {
        competitor_name: 'UniverCell',
        prices: [],
        success: false,
        error: 'UniverCell device types unavailable - action IDs may have changed',
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
