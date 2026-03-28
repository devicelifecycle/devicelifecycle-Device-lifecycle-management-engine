#!/usr/bin/env npx tsx
/**
 * Agent 1 — Full Catalog
 * Run all full catalog scrapers (Bell/Telus/UniverCell/GoRecell), retry up to 3 times per provider,
 * and fail if any provider has success=false, count=0, or missing conditions (excellent, good, fair, broken).
 * Output JSON summary only.
 */

import { scrapeBellFullCatalog } from '../../src/lib/scrapers/adapters/bell'
import { scrapeTelusFullCatalog } from '../../src/lib/scrapers/adapters/telus'
import { scrapeUniversalFullCatalog } from '../../src/lib/scrapers/adapters/universal'
import { scrapeGoRecellFullCatalog } from '../../src/lib/scrapers/adapters/gorecell'
import type { ScraperResult } from '../../src/lib/scrapers/types'

const REQUIRED_CONDITIONS = ['excellent', 'good', 'fair', 'broken'] as const
const MAX_RETRIES = 3

const PROVIDERS = [
  { id: 'bell', name: 'Bell', fn: scrapeBellFullCatalog },
  { id: 'telus', name: 'Telus', fn: scrapeTelusFullCatalog },
  { id: 'univercell', name: 'UniverCell', fn: scrapeUniversalFullCatalog },
  { id: 'gorecell', name: 'GoRecell', fn: scrapeGoRecellFullCatalog },
] as const

interface ProviderSummary {
  provider: string
  success: boolean
  count: number
  conditions_present: string[]
  conditions_missing: string[]
  error?: string
  duration_ms: number
  attempts: number
  pass: boolean
}

function conditionsFromPrices(result: ScraperResult): Set<string> {
  const seen = new Set<string>()
  for (const p of result.prices) {
    const c = (p.condition || 'good').toLowerCase()
    if (REQUIRED_CONDITIONS.includes(c as (typeof REQUIRED_CONDITIONS)[number])) {
      seen.add(c)
    }
  }
  return seen
}

async function runWithRetry(
  provider: (typeof PROVIDERS)[number]
): Promise<{ result: ScraperResult; attempts: number }> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await provider.fn()
      return { result, attempts: attempt }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * attempt))
      }
    }
  }
  return {
    result: {
      competitor_name: provider.name,
      prices: [],
      success: false,
      error: lastError?.message ?? 'Unknown error',
      duration_ms: 0,
    },
    attempts: MAX_RETRIES,
  }
}

async function main() {
  const summaries: ProviderSummary[] = []
  let overallPass = true

  for (const provider of PROVIDERS) {
    const { result, attempts } = await runWithRetry(provider)
    const conditionsPresent = Array.from(conditionsFromPrices(result))
    const conditionsMissing = REQUIRED_CONDITIONS.filter((c) => !conditionsPresent.includes(c))
    const count = result.prices.filter((p) => p.trade_in_price != null).length

    const failReasons: string[] = []
    if (!result.success) failReasons.push('success=false')
    if (count === 0) failReasons.push('count=0')
    if (conditionsMissing.length > 0) failReasons.push(`missing_conditions=[${conditionsMissing.join(',')}]`)

    const pass = result.success && count > 0 && conditionsMissing.length === 0
    if (!pass) overallPass = false

    summaries.push({
      provider: provider.name,
      success: result.success,
      count,
      conditions_present: conditionsPresent,
      conditions_missing: conditionsMissing,
      error: result.error,
      duration_ms: result.duration_ms,
      attempts,
      pass,
    })
  }

  const output = {
    agent: 'agent1-full-catalog',
    timestamp: new Date().toISOString(),
    pass: overallPass,
    summary: summaries,
    fail_reason: overallPass ? undefined : summaries.find((s) => !s.pass)?.error ?? 'One or more providers failed',
  }

  console.log(JSON.stringify(output, null, 0))
  process.exit(overallPass ? 0 : 1)
}

main().catch((e) => {
  console.log(
    JSON.stringify({
      agent: 'agent1-full-catalog',
      timestamp: new Date().toISOString(),
      pass: false,
      error: e instanceof Error ? e.message : String(e),
    })
  )
  process.exit(1)
})
