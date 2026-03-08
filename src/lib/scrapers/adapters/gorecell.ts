// ============================================================================
// GORECELL TRADE-IN SCRAPER
// ============================================================================
// GoRecell.ca — Canadian device buyback/trade-in
// Product pages embed query_data JSON with storage (fixed $) and condition (% modifier).
// We scrape the product page HTML to extract these prices.

import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, throttle } from '../utils'

const STORE_API = 'https://gorecell.ca/wp-json/wc/store/v1/products'
const PRODUCT_BASE = 'https://gorecell.ca/product/'

interface WooProduct {
  id: number
  name: string
  slug: string
}

interface QueryRule {
  title: string
  desc?: string
  price: string
  price_formate: 'fixed' | 'percent'
}

interface QueryStep {
  title: string
  rules: Record<string, QueryRule>
}

type QueryData = Record<string, QueryStep>

/** Extract query_data JSON from product page HTML */
function extractQueryData(html: string): QueryData | null {
  // Match JSON.parse('...') - capture content handling escaped quotes
  const match = html.match(/var\s+query_data\s*=\s*JSON\.parse\s*\(\s*'((?:[^'\\]|\\.)*)'\s*\)/)
  if (!match) return null
  try {
    const raw = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    return JSON.parse(raw) as QueryData
  } catch {
    return null
  }
}

/** Normalize storage for matching (e.g. "256GB" vs "256 GB") */
function normalizeStorage(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').trim()
}

/** Map our condition to GoRecell's (prefer best match) */
function mapCondition(ourCond?: string): string {
  const c = (ourCond || 'good').toLowerCase()
  if (c === 'excellent' || c === 'new' || c === 'like_new') return 'Like New'
  if (c === 'good') return 'Good'
  if (c === 'fair') return 'Fair'
  if (c === 'poor' || c === 'defective') return 'Defective'
  return 'Good'
}

/** Get base price from storage step and condition multiplier from condition step */
function computePrice(queryData: QueryData, storage: string, condition: string): number | null {
  let basePrice: number | null = null
  let conditionMultiplier = 1

  for (const step of Object.values(queryData)) {
    if (!step.rules) continue
    for (const rule of Object.values(step.rules)) {
      const ruleTitle = (rule.title || '').trim()
      const priceStr = (rule.price || '').trim()
      if (rule.price_formate === 'fixed') {
        const price = parseFloat(priceStr)
        if (!Number.isNaN(price) && price > 0) {
          const ruleStorageNorm = normalizeStorage(ruleTitle)
          const ourStorageNorm = normalizeStorage(storage)
          if (ruleStorageNorm === ourStorageNorm || ruleStorageNorm.includes(ourStorageNorm) || ourStorageNorm.includes(ruleStorageNorm)) {
            basePrice = price
            break
          }
        }
      } else if (rule.price_formate === 'percent' && ruleTitle.toLowerCase().includes(condition.toLowerCase())) {
        const pct = parseFloat(priceStr)
        if (!Number.isNaN(pct)) {
          conditionMultiplier = 1 + pct / 100
        } else if (priceStr === '' && /like\s*new|excellent/i.test(ruleTitle)) {
          conditionMultiplier = 1 // Like New = no discount
        }
      }
    }
  }

  if (basePrice == null) return null
  const final = basePrice * conditionMultiplier
  return Math.round(final * 100) / 100
}

/** Try alternate storage matches; for N/A or "any", returns first available fixed price */
function findBestStorageMatch(queryData: QueryData, storage: string): number | null {
  const ourNorm = normalizeStorage(storage)
  const useAny = ourNorm === 'n/a' || ourNorm === 'any' || ourNorm === ''
  let best: { price: number; match: number } | null = null

  for (const step of Object.values(queryData)) {
    if (!step.rules) continue
    for (const rule of Object.values(step.rules)) {
      if (rule.price_formate !== 'fixed') continue
      const price = parseFloat(rule.price)
      if (Number.isNaN(price) || price <= 0) continue
      const ruleNorm = normalizeStorage(rule.title)
      const exact = ruleNorm === ourNorm
      const contains = ruleNorm.includes(ourNorm) || ourNorm.includes(ruleNorm)
      const matchScore = useAny ? 1 : exact ? 2 : contains ? 1 : 0
      if (matchScore > 0 && (!best || matchScore > best.match || (matchScore === best.match && price > best.price))) {
        best = { price, match: matchScore }
      }
    }
  }
  return best?.price ?? null
}

export async function scrapeGoRecell(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    for (const device of devices) {
      try {
        const modelLower = device.model.toLowerCase()
        // Search catalog for this model (narrows results vs full 100)
        const searchUrl = `${STORE_API}?search=${encodeURIComponent(device.model)}&per_page=10`
        const catalogRes = await fetchWithRetry(searchUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        })
        const catalogRaw = catalogRes.ok ? await catalogRes.json() : []
        const catalog: WooProduct[] = Array.isArray(catalogRaw) ? catalogRaw : []
        const match = catalog.find(
          p => p?.name && typeof p.name === 'string' && p.name.toLowerCase().includes(modelLower)
        )
        if (!match?.slug) {
          prices.push({
            competitor_name: 'GoRecell',
            make: device.make, model: device.model, storage: device.storage,
            trade_in_price: null, sell_price: null,
            condition: device.condition ?? 'good', scraped_at: now,
            raw: { matched: false, source: 'no-product-slug' },
          })
          await throttle(400)
          continue
        }

        const productUrl = `${PRODUCT_BASE}${match.slug}/`
        const pageRes = await fetchWithRetry(productUrl, { method: 'GET' })
        const html = pageRes.ok ? await pageRes.text() : ''

        const queryData = extractQueryData(html)
        let tradePrice: number | null = null
        let source = 'none'

        if (queryData) {
          const cond = mapCondition(device.condition)
          const storageToUse = (device.storage === 'N/A' || !device.storage) ? '' : device.storage
          tradePrice = computePrice(queryData, storageToUse, cond)
          if (tradePrice != null) {
            source = 'query_data'
          }
          if (tradePrice == null) {
            const basePrice = findBestStorageMatch(queryData, storageToUse)
            if (basePrice != null) {
              const condKey = Object.keys(queryData).find(k =>
                queryData[k]?.rules && Object.values(queryData[k].rules).some(
                  r => r.title?.toLowerCase().includes(cond.toLowerCase())
                )
              )
              let mult = 1
              if (condKey && queryData[condKey]?.rules) {
                for (const r of Object.values(queryData[condKey].rules)) {
                  if (r.title?.toLowerCase().includes(cond.toLowerCase()) && r.price_formate === 'percent') {
                    const p = parseFloat(r.price)
                    if (!Number.isNaN(p)) mult = 1 + p / 100
                    break
                  }
                }
              }
              tradePrice = Math.round(basePrice * mult * 100) / 100
              source = 'query_data_fallback'
            }
          }
        }

        prices.push({
          competitor_name: 'GoRecell',
          make: device.make, model: device.model, storage: device.storage,
          trade_in_price: tradePrice, sell_price: null,
          condition: device.condition ?? 'good', scraped_at: now,
          raw: { matched: tradePrice != null, source },
        })
        await throttle(400)
      } catch (e) {
        console.warn(`[gorecell] Skip ${device.make} ${device.model}:`, e)
        prices.push({
          competitor_name: 'GoRecell',
          make: device.make, model: device.model, storage: device.storage,
          trade_in_price: null, sell_price: null,
          condition: device.condition ?? 'good', scraped_at: now,
          raw: { matched: false, error: e instanceof Error ? e.message : 'Unknown' },
        })
      }
    }

    return { competitor_name: 'GoRecell', prices, success: true, duration_ms: Date.now() - start }
  } catch (error) {
    return { competitor_name: 'GoRecell', prices: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', duration_ms: Date.now() - start }
  }
}

/** Infer make/brand from product name */
function inferMake(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('iphone') || n.includes('ipad') || n.includes('macbook') || n.includes('mac ') || n.includes('imac') || n.includes('apple watch')) return 'Apple'
  if (n.includes('galaxy')) return 'Samsung'
  if (n.includes('pixel')) return 'Google'
  if (n.includes('surface')) return 'Microsoft'
  if (n.includes('oneplus')) return 'OnePlus'
  if (n.includes('legion')) return 'Lenovo'
  if (n.includes('razer')) return 'Razer'
  if (n.includes('alienware') || n.includes('xps') || n.includes('dell')) return 'Dell'
  if (n.includes('ray-ban')) return 'Ray-Ban'
  return 'Other'
}

/** Infer category from product name */
function inferCategory(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('watch')) return 'watch'
  if (n.includes('ipad') || n.includes('tab') || n.includes('tablet')) return 'tablet'
  if (n.includes('macbook') || n.includes('laptop') || n.includes('razer') || n.includes('alienware') || n.includes('xps') || n.includes('surface') || n.includes('legion')) return 'laptop'
  return 'phone'
}

const DISCOVERY_CONDITIONS: Array<{ key: 'excellent' | 'good' | 'fair' | 'broken'; sourceLabel: string }> = [
  { key: 'excellent', sourceLabel: 'Like New' },
  { key: 'good', sourceLabel: 'Good' },
  { key: 'fair', sourceLabel: 'Fair' },
  { key: 'broken', sourceLabel: 'Defective' },
]

/** Extract all storage + price pairs from query_data (good condition) */
function extractAllStoragePrices(queryData: QueryData, condition: string): Array<{ storage: string; price: number }> {
  const results: Array<{ storage: string; price: number }> = []
  let conditionMultiplier = 1

  for (const step of Object.values(queryData)) {
    if (!step.rules) continue
    for (const rule of Object.values(step.rules)) {
      const ruleTitle = (rule.title || '').trim()
      const priceStr = (rule.price || '').trim()
      if (rule.price_formate === 'percent' && ruleTitle.toLowerCase().includes(condition.toLowerCase())) {
        const pct = parseFloat(priceStr)
        conditionMultiplier = Number.isNaN(pct) ? 1 : 1 + pct / 100
      }
    }
  }

  for (const step of Object.values(queryData)) {
    if (!step.rules) continue
    for (const rule of Object.values(step.rules)) {
      if (rule.price_formate !== 'fixed') continue
      const price = parseFloat(rule.price)
      if (Number.isNaN(price) || price <= 0) continue
      const storage = rule.title?.trim() || 'Unknown'
      const final = Math.round(price * conditionMultiplier * 100) / 100
      results.push({ storage, price: final })
    }
  }
  return results
}

/** Discovery mode: scrape full GoRecell catalog, return all devices + prices (no input devices needed) */
export async function scrapeGoRecellFullCatalog(limitProducts = 150): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    let page = 1
    const perPage = 30
    let fetched = 0

    while (fetched < limitProducts) {
      const url = `${STORE_API}?page=${page}&per_page=${perPage}`
      const res = await fetchWithRetry(url, { method: 'GET', headers: { Accept: 'application/json' } })
      const raw = res.ok ? await res.json() : []
      const products: WooProduct[] = Array.isArray(raw) ? raw : []
      if (products.length === 0) break

      for (const p of products) {
        if (fetched >= limitProducts) break
        if (!p?.name || !p?.slug) continue

        try {
          const productUrl = `${PRODUCT_BASE}${p.slug}/`
          const pageRes = await fetchWithRetry(productUrl, { method: 'GET' })
          const html = pageRes.ok ? await pageRes.text() : ''
          const queryData = extractQueryData(html)

          if (!queryData) {
            await throttle(300)
            continue
          }

          const make = inferMake(p.name)
          const model = p.name.trim()
          for (const condition of DISCOVERY_CONDITIONS) {
            const storagePrices = extractAllStoragePrices(queryData, condition.sourceLabel)

            for (const { storage, price } of storagePrices) {
              prices.push({
                competitor_name: 'GoRecell',
                make,
                model,
                storage,
                trade_in_price: price,
                sell_price: null,
                condition: condition.key,
                scraped_at: now,
                raw: { source: 'discovery' },
              })
            }
          }
          fetched++
          await throttle(350)
        } catch (e) {
          console.warn(`[gorecell-discovery] Skip ${p.name}:`, e)
        }
      }
      page++
      if (products.length < perPage) break
    }

    return { competitor_name: 'GoRecell', prices, success: true, duration_ms: Date.now() - start }
  } catch (error) {
    return { competitor_name: 'GoRecell', prices: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', duration_ms: Date.now() - start }
  }
}
