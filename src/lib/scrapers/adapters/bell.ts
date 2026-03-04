// ============================================================================
// BELL TRADE-IN SCRAPER
// ============================================================================

import cheerio from 'cheerio'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, parsePrice, throttle } from '../utils'

const TRADE_IN_URL = 'https://www.bell.ca/Mobility/Trade-in'

type $Root = ReturnType<typeof cheerio.load>

export async function scrapeBell(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    const res = await fetchWithRetry(TRADE_IN_URL, { method: 'GET' })
    const html = await res.text()
    const $ = cheerio.load(html)

    const scriptData = extractEmbeddedJson($)
    const domPrices = extractDomPrices($)

    for (const device of devices) {
      const modelLower = device.model.toLowerCase()
      const storageLower = device.storage.toLowerCase()
      let tradePrice: number | null = null

      if (scriptData.length > 0) {
        const match = scriptData.find(item =>
          item.name.toLowerCase().includes(modelLower) &&
          (!item.storage || item.storage.toLowerCase().includes(storageLower))
        )
        if (match) tradePrice = match.price
      }

      if (tradePrice == null && domPrices.length > 0) {
        const match = domPrices.find(item => item.context.toLowerCase().includes(modelLower))
        if (match) tradePrice = match.price
      }

      prices.push({
        competitor_name: 'Bell', make: device.make, model: device.model, storage: device.storage,
        trade_in_price: tradePrice, sell_price: null, condition: device.condition ?? 'good',
        scraped_at: now, raw: { matched: tradePrice != null },
      })
      await throttle(300)
    }

    return { competitor_name: 'Bell', prices, success: true, duration_ms: Date.now() - start }
  } catch (error) {
    return { competitor_name: 'Bell', prices: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', duration_ms: Date.now() - start }
  }
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
