// ============================================================================
// GORECELL TRADE-IN SCRAPER
// ============================================================================
// GoRecell.ca — Canadian device buyback/trade-in
// Uses their public WooCommerce Store API to search for device listings.
// NOTE: GoRecell's actual trade-in prices are quote-based (dynamic widget).
// For competitive pricing, use the CSV import via competitor-sync cron.

import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, throttle } from '../utils'

const STORE_API = 'https://gorecell.ca/wp-json/wc/store/v1/products'

interface WooProduct {
  name: string
  slug: string
  prices: { price: string; regular_price: string; sale_price: string }
}

export async function scrapeGoRecell(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    for (const device of devices) {
      try {
        const searchTerm = `${device.model}`
        const url = `${STORE_API}?search=${encodeURIComponent(searchTerm)}&per_page=5`

        const res = await fetchWithRetry(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        })

        let tradePrice: number | null = null

        if (res.ok) {
          const products: WooProduct[] = await res.json()
          const modelLower = device.model.toLowerCase()

          const match = products.find(p =>
            p.name.toLowerCase().includes(modelLower)
          )

          if (match) {
            // WooCommerce stores prices in minor units (cents)
            const priceCents = parseInt(match.prices.regular_price || match.prices.price || '0', 10)
            if (priceCents > 0) {
              tradePrice = priceCents / 100
            }
          }
        }

        prices.push({
          competitor_name: 'GoRecell',
          make: device.make, model: device.model, storage: device.storage,
          trade_in_price: tradePrice, sell_price: null,
          condition: device.condition ?? 'good', scraped_at: now,
          raw: { matched: tradePrice != null, source: 'woocommerce-api' },
        })
        await throttle(500)
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
