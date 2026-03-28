#!/usr/bin/env npx tsx
import { scrapeApple } from '../src/lib/scrapers/adapters/apple'
import { scrapeBell, scrapeBellFullCatalog } from '../src/lib/scrapers/adapters/bell'
import { scrapeGoRecell, scrapeGoRecellFullCatalog } from '../src/lib/scrapers/adapters/gorecell'
import { scrapeTelus, scrapeTelusFullCatalog } from '../src/lib/scrapers/adapters/telus'
import { scrapeUniversal, scrapeUniversalFullCatalog } from '../src/lib/scrapers/adapters/universal'
import {
  appleValidationDevices,
  commonValidationDevices,
  univercellValidationDevices,
} from '../src/lib/scrapers/validation-fixtures'
import type { DeviceToScrape, ScrapedPrice, ScraperResult } from '../src/lib/scrapers/types'

type ProviderSummary = {
  targeted: ComparisonSummary
  discovery?: ComparisonSummary
}

type ComparisonSummary = {
  ts_success: boolean
  scrapling_success: boolean
  ts_count: number
  scrapling_count: number
  overlapping_keys: number
  ts_only_count: number
  scrapling_only_count: number
  average_trade_in_delta: number
  max_trade_in_delta: number
}

const VALIDATION_TIMEOUT_MS = Number(process.env.SCRAPLING_VALIDATION_TIMEOUT_MS || '300000')

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100
}

function priceKey(price: ScrapedPrice): string {
  return [
    (price.make || '').trim().toLowerCase(),
    (price.model || '').trim().toLowerCase(),
    (price.storage || '').trim().toLowerCase(),
    (price.condition || 'good').trim().toLowerCase(),
  ].join('|')
}

function compare(tsResult: ScraperResult, scraplingResult: ScraperResult): ComparisonSummary {
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

async function withImpl<T>(envKey: string, impl: 'ts' | 'scrapling', fn: () => Promise<T>): Promise<T> {
  const previous = process.env[envKey]
  process.env[envKey] = impl
  try {
    return await fn()
  } finally {
    if (previous == null) delete process.env[envKey]
    else process.env[envKey] = previous
  }
}

async function withTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return await Promise.race([
    fn(),
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${VALIDATION_TIMEOUT_MS}ms`)), VALIDATION_TIMEOUT_MS)
    }),
  ])
}

async function runTargeted(envKey: string, devices: DeviceToScrape[], fn: (devices: DeviceToScrape[]) => Promise<ScraperResult>) {
  const tsResult = await withTimeout(`${envKey} targeted TS`, () => withImpl(envKey, 'ts', () => fn(devices)))
  const scraplingResult = await withTimeout(`${envKey} targeted Scrapling`, () => withImpl(envKey, 'scrapling', () => fn(devices)))
  return compare(tsResult, scraplingResult)
}

async function runDiscovery(envKey: string, fn: () => Promise<ScraperResult>) {
  const tsResult = await withTimeout(`${envKey} discovery TS`, () => withImpl(envKey, 'ts', () => fn()))
  const scraplingResult = await withTimeout(`${envKey} discovery Scrapling`, () => withImpl(envKey, 'scrapling', () => fn()))
  return compare(tsResult, scraplingResult)
}

async function main() {
  const summary: Record<string, ProviderSummary> = {}

  console.log('Validating Apple Trade-In...')
  summary.apple = {
    targeted: await runTargeted('SCRAPER_APPLE_IMPL', appleValidationDevices, scrapeApple),
  }

  console.log('Validating Bell...')
  summary.bell = {
    targeted: await runTargeted('SCRAPER_BELL_IMPL', commonValidationDevices, scrapeBell),
    discovery: await runDiscovery('SCRAPER_BELL_IMPL', () => scrapeBellFullCatalog()),
  }

  console.log('Validating GoRecell...')
  summary.gorecell = {
    targeted: await runTargeted('SCRAPER_GORECELL_IMPL', commonValidationDevices, scrapeGoRecell),
    discovery: await runDiscovery('SCRAPER_GORECELL_IMPL', () => scrapeGoRecellFullCatalog()),
  }

  console.log('Validating Telus...')
  summary.telus = {
    targeted: await runTargeted('SCRAPER_TELUS_IMPL', commonValidationDevices, scrapeTelus),
    discovery: await runDiscovery('SCRAPER_TELUS_IMPL', () => scrapeTelusFullCatalog()),
  }

  console.log('Validating UniverCell...')
  summary.univercell = {
    targeted: await runTargeted('SCRAPER_UNIVERCELL_IMPL', univercellValidationDevices, scrapeUniversal),
    discovery: await runDiscovery('SCRAPER_UNIVERCELL_IMPL', () => scrapeUniversalFullCatalog()),
  }

  console.log(JSON.stringify(summary, null, 2))

  const failures: string[] = []
  for (const [provider, providerSummary] of Object.entries(summary)) {
    const targeted = providerSummary.targeted
    if (!targeted.ts_success) failures.push(`${provider}: targeted TS failed`)
    if (!targeted.scrapling_success) failures.push(`${provider}: targeted Scrapling failed`)
    if (targeted.scrapling_count < targeted.ts_count) failures.push(`${provider}: targeted Scrapling returned fewer rows than TS`)
    if (targeted.max_trade_in_delta > 50) failures.push(`${provider}: targeted max trade-in delta too high (${targeted.max_trade_in_delta})`)

    const discovery = providerSummary.discovery
    if (!discovery) continue
    if (!discovery.ts_success) failures.push(`${provider}: discovery TS failed`)
    if (!discovery.scrapling_success) failures.push(`${provider}: discovery Scrapling failed`)
    if (discovery.scrapling_count < Math.floor(discovery.ts_count * 0.9)) {
      failures.push(`${provider}: discovery Scrapling count too low (${discovery.scrapling_count} vs ${discovery.ts_count})`)
    }
  }

  if (failures.length > 0) {
    console.error('\nRollout validation failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log('\nScrapling rollout validation passed.')
}

main().catch((error) => {
  console.error('Rollout validation crashed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
