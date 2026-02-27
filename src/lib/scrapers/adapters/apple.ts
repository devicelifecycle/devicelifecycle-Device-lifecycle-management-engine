// ============================================================================
// APPLE TRADE-IN SCRAPER
// ============================================================================
// Apple trade-in: apple.com/ca/trade-in/

import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, parsePrice } from '../utils'

const BASE_URL = 'https://www.apple.com'
const SCRAPER_ID = 'apple'

export async function scrapeApple(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    const tradeInUrl = `${BASE_URL}/ca/trade-in/`

    for (const device of devices) {
      try {
        const res = await fetchWithRetry(tradeInUrl, { method: 'GET' })
        const html = await res.text()

        const priceMatch = html.match(/\$[\d,]+\.?\d*/)
        const tradePrice = priceMatch ? parsePrice(priceMatch[0]) : null

        prices.push({
          competitor_name: 'Apple',
          make: device.make,
          model: device.model,
          storage: device.storage,
          trade_in_price: tradePrice,
          sell_price: null,
          condition: device.condition ?? 'good',
          scraped_at: now,
        })
      } catch (e) {
        console.warn(`[${SCRAPER_ID}] Skip ${device.make} ${device.model}:`, e)
      }
    }

    return {
      competitor_name: 'Apple',
      prices,
      success: true,
      duration_ms: Date.now() - start,
    }
  } catch (error) {
    return {
      competitor_name: 'Apple',
      prices: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - start,
    }
  }
}
