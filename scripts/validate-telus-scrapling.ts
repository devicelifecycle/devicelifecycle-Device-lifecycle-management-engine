#!/usr/bin/env npx tsx
import { scrapeTelus, scrapeTelusFullCatalog } from '../src/lib/scrapers/adapters/telus'
import { commonValidationDevices } from '../src/lib/scrapers/validation-fixtures'
import type { ScrapedPrice, ScraperResult } from '../src/lib/scrapers/types'

function setImpl(impl: 'ts' | 'scrapling') {
  process.env.SCRAPER_TELUS_IMPL = impl
}

function priceKey(price: ScrapedPrice): string {
  return [
    (price.make || '').trim().toLowerCase(),
    (price.model || '').trim().toLowerCase(),
    (price.storage || '').trim().toLowerCase(),
    (price.condition || 'good').trim().toLowerCase(),
  ].join('|')
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100
}

function compare(tsResult: ScraperResult, scraplingResult: ScraperResult) {
  const tsMap = new Map(tsResult.prices.map((price) => [priceKey(price), price]))
  const scraplingMap = new Map(scraplingResult.prices.map((price) => [priceKey(price), price]))
  const tsKeys = new Set(tsMap.keys())
  const scraplingKeys = new Set(scraplingMap.keys())
  const overlap = Array.from(tsKeys).filter((key) => scraplingKeys.has(key))
  const deltas: number[] = []
  for (const key of overlap) {
    const left = tsMap.get(key)?.trade_in_price
    const right = scraplingMap.get(key)?.trade_in_price
    if (left == null || right == null) continue
    deltas.push(Math.abs(left - right))
  }
  return {
    ts_success: tsResult.success,
    scrapling_success: scraplingResult.success,
    ts_count: tsResult.prices.length,
    scrapling_count: scraplingResult.prices.length,
    overlapping_keys: overlap.length,
    ts_only_count: Array.from(tsKeys).filter((key) => !scraplingKeys.has(key)).length,
    scrapling_only_count: Array.from(scraplingKeys).filter((key) => !tsKeys.has(key)).length,
    average_trade_in_delta: deltas.length > 0 ? roundMetric(deltas.reduce((sum, value) => sum + value, 0) / deltas.length) : 0,
    max_trade_in_delta: deltas.length > 0 ? roundMetric(Math.max(...deltas)) : 0,
  }
}

async function main() {
  console.log('Validating Telus targeted sample devices...')
  setImpl('ts')
  const tsTargeted = await scrapeTelus([...commonValidationDevices])
  setImpl('scrapling')
  const scraplingTargeted = await scrapeTelus([...commonValidationDevices])

  console.log('Validating Telus discovery mode...')
  setImpl('ts')
  const tsDiscovery = await scrapeTelusFullCatalog()
  setImpl('scrapling')
  const scraplingDiscovery = await scrapeTelusFullCatalog()

  const summary = {
    targeted: compare(tsTargeted, scraplingTargeted),
    discovery: compare(tsDiscovery, scraplingDiscovery),
  }

  console.log(JSON.stringify(summary, null, 2))

  const failures: string[] = []
  if (!summary.targeted.ts_success) failures.push('Targeted TS scraper failed')
  if (!summary.targeted.scrapling_success) failures.push('Targeted Scrapling scraper failed')
  if (summary.targeted.scrapling_count < summary.targeted.ts_count) failures.push('Targeted Scrapling returned fewer rows than TS')
  if (summary.targeted.max_trade_in_delta > 50) failures.push(`Targeted max trade-in delta too high: ${summary.targeted.max_trade_in_delta}`)

  if (!summary.discovery.ts_success) failures.push('Discovery TS scraper failed')
  if (!summary.discovery.scrapling_success) failures.push('Discovery Scrapling scraper failed')
  if (summary.discovery.scrapling_count < Math.floor(summary.discovery.ts_count * 0.9)) {
    failures.push(`Discovery Scrapling count too low: ${summary.discovery.scrapling_count} vs ${summary.discovery.ts_count}`)
  }

  if (failures.length > 0) {
    console.error('\nValidation failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log('\nTelus Scrapling validation passed.')
}

main().catch((error) => {
  console.error('Validation crashed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
