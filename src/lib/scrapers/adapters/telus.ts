// ============================================================================
// TELUS TRADE-IN SCRAPER
// ============================================================================
// Telus mobility trade-in: telus.com/en/mobility/trade-in

import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, parsePrice } from '../utils'

const BASE_URL = 'https://www.telus.com'
const SCRAPER_ID = 'telus'

export async function scrapeTelus(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    const tradeInUrl = `${BASE_URL}/en/mobility/trade-in`

    for (const device of devices) {
      try {
        const res = await fetchWithRetry(tradeInUrl, { method: 'GET' })
        const html = await res.text()

        const priceMatch = html.match(/\$[\d,]+\.?\d*/)
        const tradePrice = priceMatch ? parsePrice(priceMatch[0]) : null

        prices.push({
          competitor_name: 'Telus',
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
      competitor_name: 'Telus',
      prices,
      success: true,
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
