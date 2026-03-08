// ============================================================================
// TELUS TRADE-IN SCRAPER
// ============================================================================

import cheerio from 'cheerio'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { extractPricesFromHtml, fetchWithRetry, parsePrice, throttle } from '../utils'
import { convertConditionPrice, expandPriceByConditions } from '../condition-pricing'

const TRADE_IN_URL = 'https://www.telus.com/en/mobility/trade-in'
const TELUS_DEVICES_API_URL = 'https://www.telus.com/mobility/trade-in/backend/devices'

type $Root = ReturnType<typeof cheerio.load>
type TelusCatalogEntry = {
  vendorCd?: string
  vendorProductId?: string
  categoryCd?: string
  manufacturerCd?: string
  modelCd?: string
  storageCd?: string
  marketValueAmt?: number
  productDescription?: Array<{ messageTxt?: string; localeCd?: string }>
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeStorage(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

function parseTelusCatalogEntries(payload: unknown): TelusCatalogEntry[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  return Object.values(record)
    .filter((entry): entry is TelusCatalogEntry => {
      if (!entry || typeof entry !== 'object') return false
      const item = entry as TelusCatalogEntry
      return typeof item.modelCd === 'string' && typeof item.marketValueAmt === 'number'
    })
}

async function fetchTelusCatalogByQuery(query: string): Promise<TelusCatalogEntry[]> {
  const params = new URLSearchParams({
    device: query,
    lang: 'en',
    salesTransactionId: crypto.randomUUID(),
  })

  const res = await fetchWithRetry(`${TELUS_DEVICES_API_URL}?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) return []

  try {
    const payload = await res.json()
    return parseTelusCatalogEntries(payload)
  } catch {
    return []
  }
}

function selectBestTelusEntry(device: DeviceToScrape, entries: TelusCatalogEntry[]): TelusCatalogEntry | null {
  const modelToken = normalizeText(device.model)
  const storageToken = normalizeStorage(device.storage)
  const makeToken = normalizeText(device.make)
  const variantKeywords = ['max', 'plus', 'ultra', 'mini', 'fold', 'flip', 'fe']

  const scored = entries
    .map((entry) => {
      const model = normalizeText(entry.modelCd || '')
      const storage = normalizeStorage(entry.storageCd || '')
      const manufacturer = normalizeText(entry.manufacturerCd || '')
      const description = normalizeText((entry.productDescription || []).map((item) => item.messageTxt || '').join(' '))

      const hasModelMatch = Boolean(
        modelToken && (model === modelToken || model.includes(modelToken) || description.includes(modelToken))
      )
      if (!hasModelMatch) {
        return {
          entry,
          score: -1,
        }
      }

      let score = 0
      if (model === modelToken) score += 12
      if (modelToken && (model.includes(modelToken) || description.includes(modelToken))) score += 6
      if (makeToken && manufacturer.includes(makeToken)) score += 2
      if (storageToken && storage.includes(storageToken)) score += 3
      if (!storageToken) score += 1

      for (const keyword of variantKeywords) {
        const deviceHas = modelToken.includes(keyword)
        const candidateHas = model.includes(keyword)
        if (deviceHas !== candidateHas) score -= 10
      }

      return {
        entry,
        score,
      }
    })
    .filter((candidate) => candidate.score >= 6)
    .sort((left, right) => right.score - left.score)

  return scored[0]?.entry || null
}

function dedupeTelusCatalogPrices(prices: ScrapedPrice[]): ScrapedPrice[] {
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

export async function scrapeTelus(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    const makeQueries = Array.from(new Set(devices.map((device) => device.make.trim()).filter(Boolean)))
    const catalogByMake = new Map<string, TelusCatalogEntry[]>()

    for (const make of makeQueries) {
      const entries = await fetchTelusCatalogByQuery(make)
      catalogByMake.set(make.toLowerCase(), entries)
      await throttle(120)
    }

    const res = await fetchWithRetry(TRADE_IN_URL, { method: 'GET' })
    const html = await res.text()
    const $ = cheerio.load(html)

    const scriptPrices = extractScriptPrices($)
    const domPrices = extractDomPrices($)
    const htmlPrices = extractPricesFromHtml(html)
    const allDomPrices = domPrices.length > 0 ? domPrices : htmlPrices

    for (const device of devices) {
      const modelToken = normalizeText(device.model)
      const storageToken = normalizeStorage(device.storage)
      let tradePrice: number | null = null

      const apiEntries = catalogByMake.get(device.make.toLowerCase()) || []
      if (apiEntries.length > 0) {
        const matched = selectBestTelusEntry(device, apiEntries)
        if (matched && typeof matched.marketValueAmt === 'number' && matched.marketValueAmt > 0) {
          tradePrice = matched.marketValueAmt
        }
      }

      if (tradePrice == null && scriptPrices.length > 0) {
        const match = scriptPrices.find(item =>
          normalizeText(item.name).includes(modelToken) &&
          (!item.storage || normalizeStorage(item.storage).includes(storageToken))
        )
        if (match) tradePrice = match.price
      }

      if (tradePrice == null && allDomPrices.length > 0) {
        const match = allDomPrices.find(item => {
          const contextToken = normalizeText(item.context)
          const contextStorage = normalizeStorage(item.context)
          const hasModel = contextToken.includes(modelToken)
          const hasStorage = !storageToken || contextStorage.includes(storageToken)
          return hasModel && hasStorage
        })
        if (match) tradePrice = match.price
      }

      const requestedCondition = device.condition ?? 'good'
      const adjustedTradePrice = convertConditionPrice(tradePrice, 'good', requestedCondition)

      prices.push({
        competitor_name: 'Telus', make: device.make, model: device.model, storage: device.storage,
        trade_in_price: adjustedTradePrice, sell_price: null, condition: requestedCondition,
        scraped_at: now, raw: { matched: tradePrice != null, source: apiEntries.length > 0 ? 'telus-api' : 'telus-dom' },
      })
      await throttle(300)
    }

    const matchedCount = prices.filter((price) => price.trade_in_price != null).length
    const success = matchedCount > 0
    return {
      competitor_name: 'Telus',
      prices,
      success,
      error: success ? undefined : 'No Telus trade-in prices matched current parser',
      duration_ms: Date.now() - start,
    }
  } catch (error) {
    return { competitor_name: 'Telus', prices: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', duration_ms: Date.now() - start }
  }
}

export async function scrapeTelusFullCatalog(): Promise<ScraperResult> {
  const start = Date.now()
  const now = new Date().toISOString()

  try {
    const querySeeds = ['Apple', 'Samsung', 'Google', 'Motorola', 'OnePlus', 'Huawei', 'LG', 'Sony', 'Microsoft']
    const allEntries: TelusCatalogEntry[] = []

    for (const seed of querySeeds) {
      const entries = await fetchTelusCatalogByQuery(seed)
      if (entries.length > 0) {
        allEntries.push(...entries)
      }
      await throttle(120)
    }

    const prices: ScrapedPrice[] = allEntries
      .filter((entry) => typeof entry.marketValueAmt === 'number' && entry.marketValueAmt > 0 && entry.modelCd)
      .flatMap((entry) =>
        expandPriceByConditions(
          {
            competitor_name: 'Telus',
            make: entry.manufacturerCd || 'Other',
            model: entry.modelCd || 'Unknown',
            storage: entry.storageCd || 'Unknown',
            sell_price: null,
            scraped_at: now,
          },
          entry.marketValueAmt || null,
          'good',
          (condition) => ({
            source: 'telus-api-discovery',
            vendorProductId: entry.vendorProductId,
            categoryCd: entry.categoryCd,
            base_condition: 'good',
            condition,
          })
        )
      )

    const deduped = dedupeTelusCatalogPrices(prices)
    return {
      competitor_name: 'Telus',
      prices: deduped,
      success: deduped.length > 0,
      error: deduped.length > 0 ? undefined : 'No Telus catalog prices discovered',
      duration_ms: Date.now() - start,
    }
  } catch (error) {
    return {
      competitor_name: 'Telus',
      prices: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - start,
    }
  }
}

function extractScriptPrices($: $Root): Array<{ name: string; price: number; storage?: string }> {
  const results: Array<{ name: string; price: number; storage?: string }> = []
  $('script').each(function (this: any) {
    const content = $(this).html() || ''

    const nextDataMatch = content.match(/__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})\s*;?\s*$/)
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1])
        extractFromObject(data, results)
      } catch { /* skip */ }
    }

    const jsonMatches = content.match(/\{[^{}]*"(?:tradeInValue|trade_in_price|estimatedValue)"[\s]*:[\s]*[\d.]+[^{}]*\}/g)
    if (jsonMatches) {
      for (const jsonStr of jsonMatches) {
        try {
          const obj = JSON.parse(jsonStr)
          const name = obj.name || obj.deviceName || obj.model || ''
          const price = obj.tradeInValue || obj.trade_in_price || obj.estimatedValue
          if (name && typeof price === 'number' && price > 5) {
            results.push({ name, price, storage: obj.storage || obj.capacity })
          }
        } catch { /* skip */ }
      }
    }
  })
  return results
}

function extractFromObject(
  obj: unknown,
  results: Array<{ name: string; price: number; storage?: string }>,
  depth = 0
): void {
  if (depth > 8 || !obj || typeof obj !== 'object') return
  const record = obj as Record<string, unknown>
  if (
    (record.tradeInValue || record.trade_in_price) &&
    (record.name || record.deviceName || record.model)
  ) {
    const price = Number(record.tradeInValue || record.trade_in_price)
    const name = String(record.name || record.deviceName || record.model)
    if (price > 5 && name) {
      results.push({ name, price, storage: record.storage ? String(record.storage) : undefined })
    }
  }
  if (Array.isArray(obj)) {
    for (const item of obj) extractFromObject(item, results, depth + 1)
  } else {
    for (const val of Object.values(record)) {
      if (typeof val === 'object' && val !== null) extractFromObject(val, results, depth + 1)
    }
  }
}

function extractDomPrices($: $Root): Array<{ price: number; context: string }> {
  const results: Array<{ price: number; context: string }> = []
  const selectors = [
    '[data-trade-in-value]', '[data-price]',
    '.trade-in-value', '.trade-value', '.device-value', '.price-value',
  ]
  for (const sel of selectors) {
    $(sel).each(function (this: any) {
      const $el = $(this)
      const text = $el.text().trim()
      const dataPrice = $el.attr('data-trade-in-value') || $el.attr('data-price') || ''
      const priceVal = parsePrice(dataPrice) || parsePrice(text)
      if (priceVal != null && priceVal >= 5 && priceVal <= 5000) {
        const parent = $el.parent().text().trim().slice(0, 100)
        results.push({ price: priceVal, context: parent })
      }
    })
  }
  return results
}
