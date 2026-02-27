// ============================================================================
// BELL TRADE-IN SCRAPER
// ============================================================================
// Bell mobility device trade-in / upgrade

import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, parsePrice } from '../utils'

const BASE_URL = 'https://www.bell.ca'
const SCRAPER_ID = 'bell'

export async function scrapeBell(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    const tradeInUrl = `${BASE_URL}/Mobility/Trade-in`

    for (const device of devices) {
      try {
        const res = await fetchWithRetry(tradeInUrl, { method: 'GET' })
        const html = await res.text()

        const priceMatch = html.match(/\$[\d,]+\.?\d*/)
        const tradePrice = priceMatch ? parsePrice(priceMatch[0]) : null

        prices.push({
          competitor_name: 'Bell',
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
      competitor_name: 'Bell',
      prices,
      success: true,
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
