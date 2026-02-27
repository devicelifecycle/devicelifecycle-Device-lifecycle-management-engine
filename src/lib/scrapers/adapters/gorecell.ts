// ============================================================================
// GORECELL TRADE-IN SCRAPER
// ============================================================================
// GoRecell.ca - Canadian device buyback/trade-in
// Quote flow: gorecell.ca/step-flow/ (device selection → condition → price)

import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, parsePrice } from '../utils'

const BASE_URL = 'https://gorecell.ca'
const SCRAPER_ID = 'gorecell'

export async function scrapeGoRecell(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    // GoRecell uses a step-flow - device selection loads prices via JS.
    // Fallback: fetch main quote page and look for price patterns.
    // Customize URL/API per actual site structure when reverse-engineered.
    const quoteUrl = `${BASE_URL}/step-flow/`

    for (const device of devices) {
      try {
        // Build device slug (e.g. iphone-15-pro-max-256gb)
        const slug = [device.make, device.model, device.storage]
          .join('-')
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')

        const res = await fetchWithRetry(quoteUrl, { method: 'GET' })
        const html = await res.text()

        // Try to extract price from page - many SPAs embed data in script or data-* attributes
        const priceMatch = html.match(/\$[\d,]+\.?\d*/)
        const tradePrice = priceMatch ? parsePrice(priceMatch[0]) : null

        if (tradePrice != null || html.includes('trade') || html.includes('quote')) {
          prices.push({
            competitor_name: 'GoRecell',
            make: device.make,
            model: device.model,
            storage: device.storage,
            trade_in_price: tradePrice,
            sell_price: null,
            condition: device.condition ?? 'good',
            scraped_at: now,
            raw: { slug, found: !!priceMatch },
          })
        }
      } catch (e) {
        console.warn(`[${SCRAPER_ID}] Skip ${device.make} ${device.model}:`, e)
      }
    }

    return {
      competitor_name: 'GoRecell',
      prices,
      success: true,
      duration_ms: Date.now() - start,
    }
  } catch (error) {
    return {
      competitor_name: 'GoRecell',
      prices: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - start,
    }
  }
}
