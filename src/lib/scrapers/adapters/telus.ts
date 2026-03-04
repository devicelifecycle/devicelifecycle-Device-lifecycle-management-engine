// ============================================================================
// TELUS TRADE-IN SCRAPER
// ============================================================================

import cheerio from 'cheerio'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../types'
import { fetchWithRetry, parsePrice, throttle } from '../utils'

const TRADE_IN_URL = 'https://www.telus.com/en/mobility/trade-in'

type $Root = ReturnType<typeof cheerio.load>

export async function scrapeTelus(devices: DeviceToScrape[]): Promise<ScraperResult> {
  const start = Date.now()
  const prices: ScrapedPrice[] = []
  const now = new Date().toISOString()

  try {
    const res = await fetchWithRetry(TRADE_IN_URL, { method: 'GET' })
    const html = await res.text()
    const $ = cheerio.load(html)

    const scriptPrices = extractScriptPrices($)
    const domPrices = extractDomPrices($)

    for (const device of devices) {
      const modelLower = device.model.toLowerCase()
      const storageLower = device.storage.toLowerCase()
      let tradePrice: number | null = null

      if (scriptPrices.length > 0) {
        const match = scriptPrices.find(item =>
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
        competitor_name: 'Telus', make: device.make, model: device.model, storage: device.storage,
        trade_in_price: tradePrice, sell_price: null, condition: device.condition ?? 'good',
        scraped_at: now, raw: { matched: tradePrice != null },
      })
      await throttle(300)
    }

    return { competitor_name: 'Telus', prices, success: true, duration_ms: Date.now() - start }
  } catch (error) {
    return { competitor_name: 'Telus', prices: [], success: false, error: error instanceof Error ? error.message : 'Unknown error', duration_ms: Date.now() - start }
  }
}

function extractScriptPrices($: $Root): Array<{ name: string; price: number; storage?: string }> {
  const results: Array<{ name: string; price: number; storage?: string }> = []
  $('script').each(function (this: any) {
    const content = $(this).html() || ''

    const nextDataMatch = content.match(/__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})\s*;?\s*$/)
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1])
        extractFromObject(data, results)
      } catch { /* skip */ }
    }

    const jsonMatches = content.match(/\{[^{}]*"(?:tradeInValue|trade_in_price|estimatedValue)"[\s]*:[\s]*[\d.]+[^{}]*\}/g)
    if (jsonMatches) {
      for (const jsonStr of jsonMatches) {
        try {
          const obj = JSON.parse(jsonStr)
          const name = obj.name || obj.deviceName || obj.model || ''
          const price = obj.tradeInValue || obj.trade_in_price || obj.estimatedValue
          if (name && typeof price === 'number' && price > 5) {
            results.push({ name, price, storage: obj.storage || obj.capacity })
          }
        } catch { /* skip */ }
      }
    }
  })
  return results
}

function extractFromObject(
  obj: unknown,
  results: Array<{ name: string; price: number; storage?: string }>,
  depth = 0
): void {
  if (depth > 8 || !obj || typeof obj !== 'object') return
  const record = obj as Record<string, unknown>
  if (
    (record.tradeInValue || record.trade_in_price) &&
    (record.name || record.deviceName || record.model)
  ) {
    const price = Number(record.tradeInValue || record.trade_in_price)
    const name = String(record.name || record.deviceName || record.model)
    if (price > 5 && name) {
      results.push({ name, price, storage: record.storage ? String(record.storage) : undefined })
    }
  }
  if (Array.isArray(obj)) {
    for (const item of obj) extractFromObject(item, results, depth + 1)
  } else {
    for (const val of Object.values(record)) {
      if (typeof val === 'object' && val !== null) extractFromObject(val, results, depth + 1)
    }
  }
}

function extractDomPrices($: $Root): Array<{ price: number; context: string }> {
  const results: Array<{ price: number; context: string }> = []
  const selectors = [
    '[data-trade-in-value]', '[data-price]',
    '.trade-in-value', '.trade-value', '.device-value', '.price-value',
  ]
  for (const sel of selectors) {
    $(sel).each(function (this: any) {
      const $el = $(this)
      const text = $el.text().trim()
      const dataPrice = $el.attr('data-trade-in-value') || $el.attr('data-price') || ''
      const priceVal = parsePrice(dataPrice) || parsePrice(text)
      if (priceVal != null && priceVal >= 5 && priceVal <= 5000) {
        const parent = $el.parent().text().trim().slice(0, 100)
        results.push({ price: priceVal, context: parent })
      }
    })
  }
  return results
}
