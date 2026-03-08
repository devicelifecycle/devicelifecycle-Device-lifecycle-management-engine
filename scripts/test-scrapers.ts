// ============================================================================
// DRY TEST: Run all 4 price scrapers and display results
// Usage: npx tsx scripts/test-scrapers.ts
// ============================================================================

import { scrapeBell } from '../src/lib/scrapers/adapters/bell'
import { scrapeBellFullCatalog } from '../src/lib/scrapers/adapters/bell'
import { scrapeTelus } from '../src/lib/scrapers/adapters/telus'
import { scrapeTelusFullCatalog } from '../src/lib/scrapers/adapters/telus'
import { scrapeGoRecell } from '../src/lib/scrapers/adapters/gorecell'
import { scrapeGoRecellFullCatalog } from '../src/lib/scrapers/adapters/gorecell'
import { scrapeApple } from '../src/lib/scrapers/adapters/apple'
import { scrapeUniversal } from '../src/lib/scrapers/adapters/universal'
import { scrapeUniversalFullCatalog } from '../src/lib/scrapers/adapters/universal'
import type { DeviceToScrape, ScraperResult } from '../src/lib/scrapers/types'

// Test devices — current-gen + older models for comparison
const TEST_DEVICES: DeviceToScrape[] = [
  // Current gen (Apple Trade-In page should have these)
  { make: 'Apple', model: 'iPhone 16 Pro Max', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 16 Pro', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 16', storage: '128GB', condition: 'good' },
  { make: 'Apple', model: 'iPad Pro', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'MacBook Air', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'Apple Watch Ultra 2', storage: 'N/A', condition: 'good' },
  // Older models (may not appear on Apple page)
  { make: 'Apple', model: 'iPhone 15 Pro Max', storage: '256GB', condition: 'good' },
  { make: 'Apple', model: 'iPhone 14', storage: '128GB', condition: 'good' },
  // Non-Apple (only Bell/Telus/GoRecell would have these)
  { make: 'Samsung', model: 'Galaxy S24 Ultra', storage: '256GB', condition: 'good' },
  { make: 'Samsung', model: 'Galaxy S23', storage: '128GB', condition: 'good' },
]

async function runScraper(name: string, fn: (devices: DeviceToScrape[]) => Promise<ScraperResult>) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${name}`)
  console.log('='.repeat(60))

  try {
    const result = await fn(TEST_DEVICES)

    console.log(`  Status:   ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`)
    console.log(`  Duration: ${result.duration_ms}ms`)
    if (result.error) console.log(`  Error:    ${result.error}`)
    console.log('')

    // Table header
    console.log(
      '  ' +
      'Device'.padEnd(30) +
      'Storage'.padEnd(10) +
      'Trade-In'.padEnd(12) +
      'Matched'
    )
    console.log('  ' + '-'.repeat(62))

    for (const p of result.prices) {
      const device = `${p.make} ${p.model}`
      const price = p.trade_in_price != null ? `$${p.trade_in_price}` : '—'
      const matched = p.trade_in_price != null ? '✅' : '❌'
      console.log(
        '  ' +
        device.padEnd(30) +
        p.storage.padEnd(10) +
        price.padEnd(12) +
        matched
      )
    }

    const matchCount = result.prices.filter(p => p.trade_in_price != null).length
    console.log(`\n  Matched: ${matchCount}/${result.prices.length} devices`)

    return result
  } catch (err) {
    console.log(`  ❌ CRASHED: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

async function runCatalogScraper(name: string, fn: () => Promise<ScraperResult>) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${name}`)
  console.log('='.repeat(60))

  try {
    const result = await fn()

    console.log(`  Status:   ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`)
    console.log(`  Duration: ${result.duration_ms}ms`)
    if (result.error) console.log(`  Error:    ${result.error}`)

    const matched = result.prices.filter((p) => p.trade_in_price != null)
    const uniqueModels = new Set(result.prices.map((p) => `${p.make}|${p.model}`)).size
    console.log(`  Prices:   ${matched.length}`)
    console.log(`  Models:   ${uniqueModels}`)

    const sample = matched.slice(0, 12)
    if (sample.length > 0) {
      console.log('')
      console.log('  Sample (first 12):')
      for (const p of sample) {
        console.log(`  - ${p.make} ${p.model} ${p.storage} => $${p.trade_in_price}`)
      }
    }

    return result
  } catch (err) {
    console.log(`  ❌ CRASHED: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

async function main() {
  const isFullCatalogMode = process.argv.includes('--full')

  if (isFullCatalogMode) {
    console.log('\n🔍 PRICE SCRAPER FULL CATALOG TEST')
    console.log('   Running full catalog discovery scrapers')
    console.log(`   Time: ${new Date().toISOString()}\n`)

    const results: (ScraperResult | null)[] = []
    results.push(await runCatalogScraper('BELL FULL CATALOG', scrapeBellFullCatalog))
    results.push(await runCatalogScraper('TELUS FULL CATALOG', scrapeTelusFullCatalog))
    results.push(await runCatalogScraper('UNIVERCELL FULL CATALOG', scrapeUniversalFullCatalog))
    results.push(await runCatalogScraper('GORECELL FULL CATALOG', scrapeGoRecellFullCatalog))

    console.log(`\n${'='.repeat(60)}`)
    console.log('  SUMMARY')
    console.log('='.repeat(60))

    for (const r of results) {
      if (!r) continue
      const matched = r.prices.filter((p) => p.trade_in_price != null).length
      const uniqueModels = new Set(r.prices.map((p) => `${p.make}|${p.model}`)).size
      const status = r.success ? '✅' : '❌'
      console.log(`  ${status} ${r.competitor_name.padEnd(20)} prices=${String(matched).padEnd(6)} models=${String(uniqueModels).padEnd(6)} ${r.duration_ms}ms`)
    }

    console.log('\n✅ Full catalog test complete.\n')
    return
  }

  console.log('\n🔍 PRICE SCRAPER DRY TEST')
  console.log(`   Testing ${TEST_DEVICES.length} devices across 5 scrapers`)
  console.log(`   Time: ${new Date().toISOString()}\n`)

  const results: (ScraperResult | null)[] = []

  // Run scrapers sequentially to avoid rate limiting
  results.push(await runScraper('APPLE TRADE-IN', scrapeApple))
  results.push(await runScraper('BELL TRADE-IN', scrapeBell))
  results.push(await runScraper('TELUS TRADE-IN', scrapeTelus))
  results.push(await runScraper('UNIVERCELL TRADE-IN', scrapeUniversal))
  results.push(await runScraper('GORECELL', scrapeGoRecell))

  // Summary
  console.log(`\n${'='.repeat(60)}`)
  console.log('  SUMMARY')
  console.log('='.repeat(60))

  for (const r of results) {
    if (!r) continue
    const matched = r.prices.filter(p => p.trade_in_price != null).length
    const status = r.success ? '✅' : '❌'
    console.log(
      `  ${status} ${r.competitor_name.padEnd(20)} ${matched}/${r.prices.length} matched   ${r.duration_ms}ms`
    )
  }

  // Price comparison table
  console.log(`\n${'='.repeat(60)}`)
  console.log('  PRICE COMPARISON')
  console.log('='.repeat(60))

  console.log(
    '  ' +
    'Device'.padEnd(28) +
    'Apple'.padEnd(10) +
    'Bell'.padEnd(10) +
    'Telus'.padEnd(10) +
    'UniverC'.padEnd(10) +
    'GoRecell'.padEnd(10)
  )
  console.log('  ' + '-'.repeat(78))

  for (const device of TEST_DEVICES) {
    const name = `${device.make} ${device.model}`
    const prices = results.map(r => {
      if (!r) return '—'
      const match = r.prices.find(p => p.make === device.make && p.model === device.model)
      return match?.trade_in_price != null ? `$${match.trade_in_price}` : '—'
    })

    console.log(
      '  ' +
      name.padEnd(28) +
      (prices[0] || '—').padEnd(10) +
      (prices[1] || '—').padEnd(10) +
      (prices[2] || '—').padEnd(10) +
      (prices[3] || '—').padEnd(10) +
      (prices[4] || '—').padEnd(10)
    )
  }

  console.log('\n✅ Dry test complete.\n')
}

main().catch(console.error)
