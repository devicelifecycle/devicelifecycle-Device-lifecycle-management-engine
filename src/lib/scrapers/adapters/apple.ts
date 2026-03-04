// ============================================================================
// APPLE TRADE-IN SCRAPER
// ============================================================================
// Scrapes live trade-in values from apple.com/ca/shop/trade-in
// Apple publishes "Up to $X" values in HTML tables per device category.

import cheerio from 'cheerio'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, parsePrice, throttle } from '../utils'

const TRADE_IN_URL = 'https://www.apple.com/ca/shop/trade-in'

type $Root = ReturnType<typeof cheerio.load>

interface AppleTradeInEntry {
  name: string
  price: number
}

export async function scrapeApple(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    const res = await fetchWithRetry(TRADE_IN_URL, { method: 'GET' })
    const html = await res.text()
    const $ = cheerio.load(html)

    const livePrices = extractLivePrices($, html)

    for (const device of devices) {
      // Only Apple devices are eligible for Apple Trade-In
      if (device.make.toLowerCase() !== 'apple') {
        prices.push({
          competitor_name: 'Apple Trade-In',
          make: device.make, model: device.model, storage: device.storage,
          trade_in_price: null, sell_price: null,
          condition: device.condition ?? 'good', scraped_at: now,
          raw: { matched: false, source: 'not-apple-device', totalScraped: livePrices.length },
        })
        continue
      }

      const modelLower = device.model.toLowerCase()
      let tradePrice: number | null = null
      let source = 'none'

      // Try exact match first
      const exact = livePrices.find(item => {
        const nameLower = item.name.toLowerCase()
        return nameLower === modelLower || nameLower.includes(modelLower) || modelLower.includes(nameLower)
      })
      if (exact) {
        tradePrice = exact.price
        source = 'live'
      }

      // Try fuzzy partial match (e.g., "iPhone 15" base model matches "iPhone 15")
      if (tradePrice == null) {
        const partial = livePrices
          .filter(item => {
            const nameLower = item.name.toLowerCase()
            return modelLower.includes(nameLower) || nameLower.includes(modelLower)
          })
          .sort((a, b) => b.name.length - a.name.length)

        if (partial.length > 0) {
          tradePrice = partial[0].price
          source = 'live-partial'
        }
      }

      prices.push({
        competitor_name: 'Apple Trade-In',
        make: device.make, model: device.model, storage: device.storage,
        trade_in_price: tradePrice, sell_price: null,
        condition: device.condition ?? 'good', scraped_at: now,
        raw: { matched: tradePrice != null, source, totalScraped: livePrices.length },
      })
      await throttle(200)
    }

    return { competitor_name: 'Apple Trade-In', prices, success: true, duration_ms: Date.now() - start }
  } catch (error) {
    return { competitor_name: 'Apple Trade-In', prices: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', duration_ms: Date.now() - start }
  }
}

function extractLivePrices($: $Root, html: string): AppleTradeInEntry[] {
  const results: AppleTradeInEntry[] = []
  const seen = new Set<string>()

  function addEntry(name: string, price: number) {
    // Clean &nbsp; and extra whitespace
    const cleanName = name.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
    const key = `${cleanName.toLowerCase()}-${price}`
    if (!seen.has(key) && price >= 10 && price <= 5000) {
      seen.add(key)
      results.push({ name: cleanName, price })
    }
  }

  // Strategy 1: Parse HTML tables — Apple's primary format
  // Each table has rows: [Device Name] [Up to $X]
  $('table').each(function (this: any) {
    $(this).find('tr').each(function (this: any) {
      const cells = $(this).find('td')
      if (cells.length >= 2) {
        const deviceName = cells.eq(0).text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
        const priceText = cells.eq(1).text().replace(/\u00a0/g, ' ').trim()

        const priceMatch = priceText.match(/\$([\d,]+)/)
        if (priceMatch && deviceName) {
          const price = parsePrice(priceMatch[1])
          if (price != null) {
            addEntry(deviceName, price)
          }
        }
      }
    })
  })

  // Strategy 2: Regex scan for "DeviceName ... Up to $X" in raw HTML
  // Handles cases where Cheerio table parsing misses something
  const devicePatterns = [
    /(iPhone\s+\d+\s*(?:Pro\s*Max|Pro|Plus|e)?)[^$]*?Up\s+to\s+\$([\d,]+)/gi,
    /(iPad\s+(?:Pro|Air|mini)?)[^$]*?Up\s+to\s+\$([\d,]+)/gi,
    /(MacBook\s+(?:Pro|Air))[^$]*?Up\s+to\s+\$([\d,]+)/gi,
    /(iMac)[^$]*?Up\s+to\s+\$([\d,]+)/gi,
    /(Mac\s+(?:mini|Pro|Studio))[^$]*?Up\s+to\s+\$([\d,]+)/gi,
    /(Apple\s+Watch\s+(?:Ultra\s*\d?|Series\s*\d+))[^$]*?Up\s+to\s+\$([\d,]+)/gi,
  ]

  for (const pattern of devicePatterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      const name = match[1].replace(/\u00a0/g, ' ').trim()
      const price = parsePrice(match[2])
      if (price != null) {
        addEntry(name, price)
      }
    }
  }

  return results
}
