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
import type { ScraperResult } from '../src/lib/scrapers/types'

const ROUNDS = Number(process.env.SCRAPLING_BURNIN_ROUNDS || '1')
const BURNIN_TIMEOUT_MS = Number(process.env.SCRAPLING_BURNIN_TIMEOUT_MS || '300000')

function setDualMode() {
  process.env.SCRAPER_UNIVERCELL_IMPL = 'dual'
  process.env.SCRAPER_BELL_IMPL = 'dual'
  process.env.SCRAPER_APPLE_IMPL = 'dual'
  process.env.SCRAPER_GORECELL_IMPL = 'dual'
  process.env.SCRAPER_TELUS_IMPL = 'dual'
}

function summarize(result: ScraperResult) {
  return {
    success: result.success,
    count: result.prices.length,
    error: result.error,
    duration_ms: result.duration_ms,
  }
}

async function withTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return await Promise.race([
    fn(),
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${BURNIN_TIMEOUT_MS}ms`)), BURNIN_TIMEOUT_MS)
    }),
  ])
}

async function main() {
  setDualMode()
  const rounds = Number.isFinite(ROUNDS) && ROUNDS > 0 ? Math.floor(ROUNDS) : 1
  const summaries: Array<Record<string, unknown>> = []

  for (let round = 1; round <= rounds; round++) {
    console.log(`Running dual-mode burn-in round ${round}/${rounds}...`)

    const apple = await withTimeout('apple targeted', () => scrapeApple(appleValidationDevices))
    const bellTargeted = await withTimeout('bell targeted', () => scrapeBell(commonValidationDevices))
    const bellDiscovery = await withTimeout('bell discovery', () => scrapeBellFullCatalog())
    const gorecellTargeted = await withTimeout('gorecell targeted', () => scrapeGoRecell(commonValidationDevices))
    const gorecellDiscovery = await withTimeout('gorecell discovery', () => scrapeGoRecellFullCatalog())
    const telusTargeted = await withTimeout('telus targeted', () => scrapeTelus(commonValidationDevices))
    const telusDiscovery = await withTimeout('telus discovery', () => scrapeTelusFullCatalog())
    const univercellTargeted = await withTimeout('univercell targeted', () => scrapeUniversal(univercellValidationDevices))
    const univercellDiscovery = await withTimeout('univercell discovery', () => scrapeUniversalFullCatalog())

    summaries.push({
      round,
      apple: summarize(apple),
      bell_targeted: summarize(bellTargeted),
      bell_discovery: summarize(bellDiscovery),
      gorecell_targeted: summarize(gorecellTargeted),
      gorecell_discovery: summarize(gorecellDiscovery),
      telus_targeted: summarize(telusTargeted),
      telus_discovery: summarize(telusDiscovery),
      univercell_targeted: summarize(univercellTargeted),
      univercell_discovery: summarize(univercellDiscovery),
    })
  }

  console.log(JSON.stringify({ rounds, summaries }, null, 2))

  const failures: string[] = []
  for (const summary of summaries) {
    for (const [key, value] of Object.entries(summary)) {
      if (key === 'round') continue
      const result = value as { success: boolean; error?: string | undefined }
      if (!result.success) failures.push(`round ${String(summary.round)} ${key}: ${result.error || 'failed'}`)
    }
  }

  if (failures.length > 0) {
    console.error('\nDual-mode burn-in failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }

  console.log('\nDual-mode burn-in passed.')
}

main().catch((error) => {
  console.error('Dual-mode burn-in crashed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
