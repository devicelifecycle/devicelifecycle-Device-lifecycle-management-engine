// ============================================================================
// GORECELL TRADE-IN SCRAPER
// ============================================================================
// GoRecell.ca — Canadian device buyback/trade-in
// Product pages embed query_data JSON with storage (fixed $) and condition (% modifier).
// We scrape the product page HTML to extract these prices.

import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, throttle } from '../utils'
import { runGoRecellScraperPilot } from './gorecell-scrapling'

const STORE_API = process.env.GORECELL_STORE_API || 'https://gorecell.ca/wp-json/wc/store/v1/products'
const PRODUCT_BASE = process.env.GORECELL_PRODUCT_BASE || 'https://gorecell.ca/product/'

interface WooProduct {
  id: number
  name: string
  slug: string
}

interface QueryRule {
  title: string
  desc?: string
  price: string
  /** GoRecell uses "price_formate" (typo); support both for robustness */
  price_formate?: 'fixed' | 'percent'
  price_format?: 'fixed' | 'percent'
}

interface QueryStep {
  title: string
  rules: Record<string, QueryRule>
}

type QueryData = Record<string, QueryStep>

/** Extract query_data JSON from product page HTML — multiple patterns for resilience */
function extractQueryData(html: string): QueryData | null {
  const patterns = [
    /var\s+query_data\s*=\s*JSON\.parse\s*\(\s*'((?:[^'\\]|\\.)*)'\s*\)/,
    /var\s+query_data\s*=\s*JSON\.parse\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)/,
    /var\s+query_data\s*=\s*(\{[^;]{10,}\})\s*;/,
    /query_data\s*[:=]\s*(\{[^;]{10,}\})/,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (!match) continue
    try {
      let raw = match[1]
      if (raw.startsWith('{')) {
        return JSON.parse(raw) as QueryData
      }
      raw = raw.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
      return JSON.parse(raw) as QueryData
    } catch {
      continue
    }
  }
  return null
}

/** Get price format from rule (GoRecell typo: price_formate; support both) */
function getPriceFormat(rule: QueryRule): 'fixed' | 'percent' | undefined {
  return rule.price_formate ?? rule.price_format
}

/** Normalize storage for matching (e.g. "256GB" vs "256 GB") */
function normalizeStorage(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').trim()
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function selectBestGoRecellProduct(catalog: WooProduct[], device: DeviceToScrape): WooProduct | null {
  const targetModel = normalizeText(device.model)
  const targetMake = normalizeText(device.make)
  const variantKeywords = ['max', 'plus', 'ultra', 'mini', 'fold', 'flip', 'fe', 'pro']

  const scored = catalog
    .map((product) => {
      const name = normalizeText(product.name || '')
      let score = 0

      if (name === targetModel) score += 20
      if (name.includes(targetModel) || targetModel.includes(name)) score += 10
      if (targetMake && name.includes(targetMake)) score += 2

      for (const keyword of variantKeywords) {
        const targetHas = targetModel.includes(keyword)
        const candidateHas = name.includes(keyword)
        if (targetHas !== candidateHas) score -= 10
      }

      return { product, score }
    })
    .filter((candidate) => candidate.score >= 10)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.product || null
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
      if (getPriceFormat(rule) === 'fixed') {
        const price = parseFloat(priceStr)
        if (!Number.isNaN(price) && price > 0) {
          const ruleStorageNorm = normalizeStorage(ruleTitle)
          const ourStorageNorm = normalizeStorage(storage)
          if (ruleStorageNorm === ourStorageNorm || ruleStorageNorm.includes(ourStorageNorm) || ourStorageNorm.includes(ruleStorageNorm)) {
            basePrice = price
            break
          }
        }
      } else if (getPriceFormat(rule) === 'percent' && ruleTitle.toLowerCase().includes(condition.toLowerCase())) {
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
      if (getPriceFormat(rule) !== 'fixed') continue
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

async function scrapeGoRecellTypeScript(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  // Phase 4: Cache catalog search results and product page query_data
  const catalogCache = new Map<string, WooProduct[]>()
  const queryDataCache = new Map<string, QueryData | null>()

  try {
    for (const device of devices) {
      try {
        // Cache key: normalized model name (devices with same model share catalog results)
        const modelKey = normalizeText(device.model)

        // Search catalog — reuse cached results for same model
        let catalog: WooProduct[]
        if (catalogCache.has(modelKey)) {
          catalog = catalogCache.get(modelKey)!
        } else {
          const searchUrl = `${STORE_API}?search=${encodeURIComponent(device.model)}&per_page=10`
          const catalogRes = await fetchWithRetry(searchUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })
          const catalogRaw = catalogRes.ok ? await catalogRes.json() : []
          catalog = Array.isArray(catalogRaw) ? catalogRaw : []
          catalogCache.set(modelKey, catalog)
          await throttle(150)
        }

        const match = selectBestGoRecellProduct(catalog, device)
        if (!match?.slug) {
          prices.push({
            competitor_name: 'GoRecell',
            make: device.make, model: device.model, storage: device.storage,
            trade_in_price: null, sell_price: null,
            condition: device.condition ?? 'good', scraped_at: now,
            raw: { matched: false, source: 'no-product-slug' },
          })
          continue
        }

        // Fetch product page query_data — reuse cached results for same slug
        let queryData: QueryData | null
        if (queryDataCache.has(match.slug)) {
          queryData = queryDataCache.get(match.slug)!
        } else {
          const productUrl = `${PRODUCT_BASE}${match.slug}/`
          const pageRes = await fetchWithRetry(productUrl, { method: 'GET' })
          const html = pageRes.ok ? await pageRes.text() : ''
          queryData = extractQueryData(html)
          queryDataCache.set(match.slug, queryData)
          await throttle(150)
        }

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
                queryData![k]?.rules && Object.values(queryData![k].rules).some(
                  r => r.title?.toLowerCase().includes(cond.toLowerCase())
                )
              )
              let mult = 1
              if (condKey && queryData[condKey]?.rules) {
                for (const r of Object.values(queryData[condKey].rules)) {
                  if (r.title?.toLowerCase().includes(cond.toLowerCase()) && getPriceFormat(r) === 'percent') {
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
  if (n.includes('legion') || n.includes('thinkpad') || n.includes('ideapad') || n.includes('yoga')) return 'Lenovo'
  if (n.includes('razer')) return 'Razer'
  if (n.includes('alienware') || n.includes('xps') || n.includes('inspiron') || n.includes('dell')) return 'Dell'
  if (n.includes('elitebook') || n.includes('spectre') || n.includes('envy') || n.includes('pavilion') || /\bhp\b/.test(n)) return 'HP'
  if (n.includes('zenbook') || n.includes('vivobook') || n.includes('rog ') || n.includes('asus')) return 'Asus'
  if (n.includes('aspire') || n.includes('swift') || n.includes('predator') || n.includes('acer')) return 'Acer'
  if (n.includes('ray-ban')) return 'Ray-Ban'
  return 'Other'
}

/** Infer category from product name */
function inferCategory(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('watch') || n.includes('band')) return 'watch'
  if (n.includes('ipad') || n.includes('galaxy tab') || n.includes('galaxy book') || n.includes('tab s') || n.includes('tablet')) return 'tablet'
  if (
    n.includes('macbook') || n.includes('imac') || n.includes('mac mini') || n.includes('mac pro') || n.includes('mac studio') ||
    n.includes('laptop') || n.includes('notebook') || n.includes('surface') ||
    n.includes('razer') || n.includes('alienware') || n.includes('xps') || n.includes('legion') ||
    n.includes('thinkpad') || n.includes('ideapad') || n.includes('zenbook') || n.includes('vivobook') ||
    n.includes('elitebook') || n.includes('spectre') || n.includes('pavilion') ||
    n.includes('aspire') || n.includes('swift') || n.includes('predator')
  ) return 'laptop'
  return 'phone'
}

const DISCOVERY_CONDITIONS: Array<{ key: 'excellent' | 'good' | 'fair' | 'broken'; sourceLabel: string }> = [
  { key: 'excellent', sourceLabel: 'Like New' },
  { key: 'good', sourceLabel: 'Good' },
  { key: 'fair', sourceLabel: 'Fair' },
  { key: 'broken', sourceLabel: 'Defective' },
]

// Regex to detect a plausible storage size anywhere in a rule title
const STORAGE_SIZE_RE = /\b(\d+)\s*(GB|TB)\b/i
// Regex to detect RAM-only labels ("16GB RAM", "8 GB Memory", "32GB DDR5")
const RAM_LABEL_RE = /\b\d+\s*GB\s*(RAM|Memory|DDR\d*|LPDDR\d*)\b/i
// Regex to detect chip/processor-only labels ("M1", "M2 Pro", "i7-13th", "Ryzen 7")
const CHIP_RE = /\b(M[1-9](\s*(Pro|Max|Ultra|Nano))?|A\d{2}[A-Z]?|i[3579][- ]\d|Core\s*Ultra|Ryzen\s*\d|Snapdragon|Exynos|Dimensity)\b/i

/** Extract all storage + price pairs from query_data for a given condition */
function extractAllStoragePrices(queryData: QueryData, condition: string): Array<{ storage: string; price: number }> {
  const results: Array<{ storage: string; price: number }> = []
  let conditionMultiplier = 1

  for (const step of Object.values(queryData)) {
    if (!step.rules) continue
    for (const rule of Object.values(step.rules)) {
      const ruleTitle = (rule.title || '').trim()
      const priceStr = (rule.price || '').trim()
      if (getPriceFormat(rule) === 'percent' && ruleTitle.toLowerCase().includes(condition.toLowerCase())) {
        const pct = parseFloat(priceStr)
        conditionMultiplier = Number.isNaN(pct) ? 1 : 1 + pct / 100
      }
    }
  }

  for (const step of Object.values(queryData)) {
    if (!step.rules) continue
    for (const rule of Object.values(step.rules)) {
      if (getPriceFormat(rule) !== 'fixed') continue
      const price = parseFloat(rule.price)
      if (Number.isNaN(price) || price <= 0) continue

      const ruleTitle = rule.title?.trim() || ''

      // Skip rules that have no storage size (GB/TB) — catches chip labels, colors, etc.
      if (!STORAGE_SIZE_RE.test(ruleTitle)) continue
      // Skip RAM-only labels ("16GB RAM", "32GB DDR5") — not a storage variant
      if (RAM_LABEL_RE.test(ruleTitle)) continue
      // Skip chip/processor variants ("M2 Pro", "i7-13th") — not a storage variant
      if (CHIP_RE.test(ruleTitle)) continue

      const storage = ruleTitle || 'Unknown'
      const final = Math.round(price * conditionMultiplier * 100) / 100
      results.push({ storage, price: final })
    }
  }
  return results
}

// Keyword searches run AFTER main pagination to capture non-phone categories that
// WooCommerce might rank low in its default product order.
const SUPPLEMENTARY_SEARCH_TERMS = [
  'ipad', 'macbook', 'imac', 'mac mini', 'mac pro',
  'galaxy tab', 'galaxy book', 'surface',
  'thinkpad', 'ideapad', 'zenbook', 'elitebook', 'spectre',
]

/** Process a single WooProduct into ScrapedPrice[] across all conditions */
async function processDiscoveryProduct(
  p: WooProduct,
  now: string,
): Promise<ScrapedPrice[]> {
  const productUrl = `${PRODUCT_BASE}${p.slug}/`
  const pageRes = await fetchWithRetry(productUrl, { method: 'GET' })
  const html = pageRes.ok ? await pageRes.text() : ''
  const queryData = extractQueryData(html)
  if (!queryData) return []

  const make = inferMake(p.name)
  const model = p.name.trim()
  const out: ScrapedPrice[] = []

  for (const condition of DISCOVERY_CONDITIONS) {
    const storagePrices = extractAllStoragePrices(queryData, condition.sourceLabel)
    for (const { storage, price } of storagePrices) {
      out.push({
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
  return out
}

/** Discovery mode: scrape full GoRecell catalog, return all devices + prices (no input devices needed) */
async function scrapeGoRecellFullCatalogTypeScript(limitProducts?: number): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const seenSlugs = new Set<string>()
  const now = new Date().toISOString()

  try {
    // ── Phase 1: paginate full WooCommerce catalog ───────────────────────────
    let page = 1
    const perPage = 30
    let fetched = 0

    while (limitProducts == null || fetched < limitProducts) {
      const url = `${STORE_API}?page=${page}&per_page=${perPage}`
      const res = await fetchWithRetry(url, { method: 'GET', headers: { Accept: 'application/json' } })
      const raw = res.ok ? await res.json() : []
      const products: WooProduct[] = Array.isArray(raw) ? raw : []
      if (products.length === 0) break

      for (const p of products) {
        if (limitProducts != null && fetched >= limitProducts) break
        if (!p?.name || !p?.slug) continue
        if (seenSlugs.has(p.slug)) continue
        seenSlugs.add(p.slug)

        try {
          const scraped = await processDiscoveryProduct(p, now)
          prices.push(...scraped)
          fetched++
          await throttle(150)
        } catch (e) {
          console.warn(`[gorecell-discovery] Skip ${p.name}:`, e)
        }
      }
      page++
      if (products.length < perPage) break
    }

    // ── Phase 2: keyword searches for non-phone categories ───────────────────
    // GoRecell's WooCommerce default ordering may bury iPads/MacBooks; explicit
    // keyword searches guarantee we capture every laptop, tablet, and desktop.
    for (const term of SUPPLEMENTARY_SEARCH_TERMS) {
      try {
        const searchUrl = `${STORE_API}?search=${encodeURIComponent(term)}&per_page=100`
        const res = await fetchWithRetry(searchUrl, { method: 'GET', headers: { Accept: 'application/json' } })
        const raw = res.ok ? await res.json() : []
        const products: WooProduct[] = Array.isArray(raw) ? raw : []

        for (const p of products) {
          if (!p?.name || !p?.slug) continue
          if (seenSlugs.has(p.slug)) continue // already processed in phase 1
          seenSlugs.add(p.slug)

          try {
            const scraped = await processDiscoveryProduct(p, now)
            prices.push(...scraped)
            await throttle(150)
          } catch (e) {
            console.warn(`[gorecell-discovery] Skip supplementary ${p.name}:`, e)
          }
        }
      } catch (e) {
        console.warn(`[gorecell-discovery] Supplementary search "${term}" failed:`, e)
      }
    }

    return { competitor_name: 'GoRecell', prices, success: true, duration_ms: Date.now() - start }
  } catch (error) {
    return { competitor_name: 'GoRecell', prices: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', duration_ms: Date.now() - start }
  }
}

export async function scrapeGoRecell(devices: DeviceToScrape[]): Promise<ScraperResult> {
  return runGoRecellScraperPilot({
    devices,
    runTypeScript: () => scrapeGoRecellTypeScript(devices),
  })
}

export async function scrapeGoRecellFullCatalog(limitProducts?: number): Promise<ScraperResult> {
  return runGoRecellScraperPilot({
    devices: [],
    discovery: true,
    limitProducts,
    runTypeScript: () => scrapeGoRecellFullCatalogTypeScript(limitProducts),
  })
}
