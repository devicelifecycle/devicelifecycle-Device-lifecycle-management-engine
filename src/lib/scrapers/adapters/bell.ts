// ============================================================================
// BELL TRADE-IN SCRAPER
// ============================================================================

import cheerio from 'cheerio'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { extractPricesFromHtml, fetchWithRetry, parsePrice, throttle } from '../utils'
import { convertConditionPrice, expandPriceByConditions } from '../condition-pricing'
import { runBellScraperPilot } from './bell-scrapling'

const TRADE_IN_URL = process.env.BELL_TRADE_IN_URL || 'https://www.bell.ca/Mobility/Trade-in-program'
const BELL_PROXY_AUTH_URL = process.env.BELL_PROXY_AUTH_URL || 'https://www.bell.ca/ajax/toolbox/CorsProxyAuthenticate'
const BELL_BASE_ADDR = process.env.BELL_TRADE_IN_BASE_ADDR || 'https://ws1-bell.sbeglobalcare.com/gc-ws-connect-1.9/rest/gcWsConnect/'

type $Root = ReturnType<typeof cheerio.load>

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeStorage(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

function parseBellPayload<T>(value: unknown): T | null {
  if (value == null) return null
  if (typeof value === 'object') return value as T

  const text = String(value).trim()
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'string') {
      return JSON.parse(parsed) as T
    }
    return parsed as T
  } catch {
    return null
  }
}

async function fetchBellSessionId(): Promise<string | null> {
  const loginUri = 'login?org_code={0}&entity_code={1}&username={2}&password={3}'
  const params = new URLSearchParams({
    key: 'TradeIn_SBE',
    baseAddress: BELL_BASE_ADDR,
    uri: loginUri,
  })

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchWithRetry(`${BELL_PROXY_AUTH_URL}?${params.toString()}`, { method: 'GET' })
    if (!res.ok) {
      await throttle(200 * (attempt + 1))
      continue
    }

    const raw = await res.text()
    const payload = parseBellPayload<{ session_id?: string; sessionId?: string }>(raw)
    const fromPayload = payload?.session_id || payload?.sessionId
    if (fromPayload) return fromPayload

    const fromRegex = raw.match(/"session(?:_|)id"\s*:\s*"([^"]+)"/i)?.[1]
    if (fromRegex) return fromRegex

    await throttle(200 * (attempt + 1))
  }

  return null
}

async function fetchBellCatalogProducts(sessionId: string): Promise<Array<{ product_code: string; product_title: string; manufacturer?: { manufacturer_name?: string } }>> {
  const uri = `getCatalogProductsLite?session_id=${encodeURIComponent(sessionId)}&category_code=TRADEIN&view_manufacturer=true&view_references_type=WEB_TAG&cache=true`
  const res = await fetchWithRetry(`${BELL_BASE_ADDR}${uri}`, { method: 'GET' })
  if (!res.ok) return []

  const payload = parseBellPayload<{ products?: Array<{ product_code: string; product_title: string; manufacturer?: { manufacturer_name?: string } }> }>(await res.text())
  return payload?.products || []
}

async function fetchBellBuybackValue(sessionId: string, productCode: string): Promise<number | null> {
  const uri = `getBuyBackProductsEstimate?session_id=${encodeURIComponent(sessionId)}&buyer_code=REDEEM&product_code=${encodeURIComponent(productCode)}`
  const res = await fetchWithRetry(`${BELL_BASE_ADDR}${uri}`, { method: 'GET' })
  if (!res.ok) return null

  const payload = parseBellPayload<{ products?: Array<{ buyback_value_max?: number | string }> }>(await res.text())
  const first = payload?.products?.[0]
  if (!first) return null
  const value = typeof first.buyback_value_max === 'string' ? Number(first.buyback_value_max) : first.buyback_value_max
  return Number.isFinite(value as number) && (value as number) > 0 ? (value as number) : null
}

function parseBellTitle(title: string): { model: string; storage: string } {
  const trimmed = title.trim()
  const storageMatch = trimmed.match(/(\d+(?:\.\d+)?\s?(?:GB|TB))/i)
  const storage = storageMatch?.[1]?.toUpperCase().replace(/\s+/g, '') || 'Unknown'
  if (!storageMatch) return { model: trimmed, storage }
  const model = trimmed.replace(storageMatch[0], '').replace(/\s{2,}/g, ' ').trim() || trimmed
  return { model, storage }
}

function dedupeBellCatalogPrices(prices: ScrapedPrice[]): ScrapedPrice[] {
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

function selectBestBellProduct(
  device: DeviceToScrape,
  products: Array<{ product_code: string; product_title: string; manufacturer?: { manufacturer_name?: string } }>
): { product_code: string; product_title: string } | null {
  const modelToken = normalizeText(device.model)
  const storageToken = normalizeStorage(device.storage)
  const makeToken = normalizeText(device.make)
  const variantKeywords = ['max', 'plus', 'ultra', 'mini', 'fold', 'flip', 'fe', 'pro']

  const scored = products
    .map((product) => {
      const titleToken = normalizeText(product.product_title || '')
      const titleStorage = normalizeStorage(product.product_title || '')
      const manufacturer = normalizeText(product.manufacturer?.manufacturer_name || '')

      let score = 0
      if (makeToken && (titleToken.includes(makeToken) || manufacturer.includes(makeToken))) score += 2
      if (modelToken && titleToken.includes(modelToken)) score += 5
      if (storageToken && titleStorage.includes(storageToken)) score += 3
      if (!storageToken) score += 1

      for (const keyword of variantKeywords) {
        const deviceHas = modelToken.includes(keyword)
        const candidateHas = titleToken.includes(keyword)
        if (deviceHas !== candidateHas) score -= 10
      }

      return {
        product,
        score,
      }
    })
    .filter((entry) => entry.score >= 5)
    .sort((left, right) => right.score - left.score)

  return scored[0]?.product || null
}

async function scrapeBellTypeScript(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    const sessionId = await fetchBellSessionId()
    const products = sessionId ? await fetchBellCatalogProducts(sessionId) : []
    const valueCache = new Map<string, number | null>()

    let allDomPrices: Array<{ price: number; context: string }> = []
    if (products.length === 0) {
      const res = await fetchWithRetry(TRADE_IN_URL, { method: 'GET' })
      const html = await res.text()
      const $ = cheerio.load(html)
      const domPrices = extractDomPrices($)
      const htmlPrices = extractPricesFromHtml(html)
      allDomPrices = domPrices.length > 0 ? domPrices : htmlPrices
    }

    for (const device of devices) {
      const modelToken = normalizeText(device.model)
      const storageToken = normalizeStorage(device.storage)
      let tradePrice: number | null = null

      if (sessionId && products.length > 0) {
        const matchedProduct = selectBestBellProduct(device, products)
        if (matchedProduct) {
          if (!valueCache.has(matchedProduct.product_code)) {
            const value = await fetchBellBuybackValue(sessionId, matchedProduct.product_code)
            valueCache.set(matchedProduct.product_code, value)
          }
          tradePrice = valueCache.get(matchedProduct.product_code) ?? null
        }
      }

      // Try to reconcile with on-page Bell trade-in value (closer to what users see)
      if (allDomPrices.length > 0) {
        const domMatch = allDomPrices.find(item => {
          const contextToken = normalizeText(item.context)
          const contextStorage = normalizeStorage(item.context)
          const hasModel = contextToken.includes(modelToken)
          const hasStorage = !storageToken || contextStorage.includes(storageToken)
          return hasModel && hasStorage
        })

        if (domMatch) {
          const domPrice = domMatch.price
          if (tradePrice == null) {
            // No API value — fall back to the DOM price directly
            tradePrice = domPrice
          } else {
            // If API value is far off from the website value (e.g. promo/mismatch),
            // prefer the website-visible price the user actually sees.
            const diff = Math.abs(tradePrice - domPrice)
            const rel = domPrice > 0 ? diff / domPrice : 0
            if (rel > 0.3) {
              tradePrice = domPrice
            }
          }
        }
      }

      const requestedCondition = device.condition ?? 'good'
      const adjustedTradePrice = convertConditionPrice(tradePrice, 'good', requestedCondition)

      prices.push({
        competitor_name: 'Bell', make: device.make, model: device.model, storage: device.storage,
        trade_in_price: adjustedTradePrice, sell_price: null, condition: requestedCondition,
        scraped_at: now, raw: { matched: tradePrice != null, source: products.length > 0 ? 'bell-api' : 'bell-dom' },
      })
      await throttle(120)
    }

    const matchedCount = prices.filter((price) => price.trade_in_price != null).length
    const success = matchedCount > 0
    return {
      competitor_name: 'Bell',
      prices,
      success,
      error: success ? undefined : 'No Bell trade-in prices matched current parser',
      duration_ms: Date.now() - start,
    }
  } catch (error) {
    return { competitor_name: 'Bell', prices: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', duration_ms: Date.now() - start }
  }
}

async function scrapeBellFullCatalogTypeScript(limitProducts = 450): Promise<ScraperResult> {
  const start = Date.now()
  const now = new Date().toISOString()

  try {
    const sessionId = await fetchBellSessionId()
    if (!sessionId) {
      return {
        competitor_name: 'Bell',
        prices: [],
        success: false,
        error: 'Unable to initialize Bell session',
        duration_ms: Date.now() - start,
      }
    }

    const products = await fetchBellCatalogProducts(sessionId)
    if (products.length === 0) {
      return {
        competitor_name: 'Bell',
        prices: [],
        success: false,
        error: 'Bell catalog returned no products',
        duration_ms: Date.now() - start,
      }
    }

    const capped = products.slice(0, limitProducts)
    const scraped: ScrapedPrice[] = []

    for (const product of capped) {
      const tradeValue = await fetchBellBuybackValue(sessionId, product.product_code)
      if (tradeValue == null) {
        await throttle(120)
        continue
      }

      const title = product.product_title || ''
      const manufacturer = (product.manufacturer?.manufacturer_name || 'Other').trim() || 'Other'
      const { model, storage } = parseBellTitle(title)

      scraped.push(
        ...expandPriceByConditions(
          {
            competitor_name: 'Bell',
            make: manufacturer,
            model,
            storage,
            sell_price: null,
            scraped_at: now,
          },
          tradeValue,
          'good',
          (condition) => ({ source: 'bell-api-discovery', product_code: product.product_code, title, base_condition: 'good', condition })
        )
      )
      await throttle(120)
    }

    const prices = dedupeBellCatalogPrices(scraped)
    return {
      competitor_name: 'Bell',
      prices,
      success: prices.length > 0,
      error: prices.length > 0 ? undefined : 'No Bell catalog prices discovered',
      duration_ms: Date.now() - start,
    }
  } catch (error) {
    return {
      competitor_name: 'Bell',
      prices: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - start,
    }
  }
}

export async function scrapeBell(devices: DeviceToScrape[]): Promise<ScraperResult> {
  return runBellScraperPilot({
    devices,
    runTypeScript: () => scrapeBellTypeScript(devices),
  })
}

export async function scrapeBellFullCatalog(limitProducts = 450): Promise<ScraperResult> {
  return runBellScraperPilot({
    devices: [],
    discovery: true,
    runTypeScript: () => scrapeBellFullCatalogTypeScript(limitProducts),
  })
}

function extractEmbeddedJson($: $Root): Array<{ name: string; price: number; storage?: string }> {
  const results: Array<{ name: string; price: number; storage?: string }> = []
  $('script').each(function (this: any) {
    const content = $(this).html() || ''
    const jsonMatches = content.match(/\{[^{}]*"(?:price|value|tradeIn|trade_in)"[\s]*:[\s]*[\d.]+[^{}]*\}/g)
    if (jsonMatches) {
      for (const jsonStr of jsonMatches) {
        try {
          const obj = JSON.parse(jsonStr)
          const name = obj.name || obj.model || obj.device || ''
          const price = obj.price || obj.value || obj.tradeIn || obj.trade_in
          if (name && typeof price === 'number' && price > 5) {
            results.push({ name, price, storage: obj.storage || obj.capacity })
          }
        } catch { /* skip */ }
      }
    }
  })
  return results
}

function extractDomPrices($: $Root): Array<{ price: number; context: string }> {
  const results: Array<{ price: number; context: string }> = []
  const selectors = [
    '[data-trade-value]', '[data-price]',
    '.trade-in-value', '.trade-value', '.device-price', '.price', '.amount',
  ]
  for (const sel of selectors) {
    $(sel).each(function (this: any) {
      const $el = $(this)
      const text = $el.text().trim()
      const dataPrice = $el.attr('data-trade-value') || $el.attr('data-price') || ''
      const priceVal = parsePrice(dataPrice) || parsePrice(text)
      if (priceVal != null && priceVal >= 5 && priceVal <= 5000) {
        const parent = $el.parent().text().trim().slice(0, 100)
        results.push({ price: priceVal, context: parent })
      }
    })
  }
  return results
}
