#!/usr/bin/env npx tsx
/**
 * Deep Catalog — Full Catalog Agent
 * Run all full-catalog scrapers with retries; fail if any provider fails or is empty.
 */

import {
  scrapeBellFullCatalog,
  scrapeTelusFullCatalog,
  scrapeUniversalFullCatalog,
  scrapeGoRecellFullCatalog,
} from '../../src/lib/scrapers'

const need = ['broken', 'excellent', 'fair', 'good'].sort().join(',')
const jobs = [
  ['bell', scrapeBellFullCatalog],
  ['telus', scrapeTelusFullCatalog],
  ['univercell', scrapeUniversalFullCatalog],
  ['gorecell', scrapeGoRecellFullCatalog],
] as const

async function main() {
  const out: Array<{
    provider: string
    success: boolean
    count: number
    conditions: string[]
    attempts: number
    error?: string
  }> = []

  for (const [name, fn] of jobs) {
    let last: Awaited<ReturnType<typeof fn>> | null = null
    let attempts = 0
    while (attempts < 3) {
      attempts++
      last = await fn()
      if (last.success && (last.prices || []).length > 0) break
      await new Promise((r) => setTimeout(r, attempts * 1000))
    }

    const conditions = Array.from(new Set((last?.prices || []).map((p: { condition?: string }) => p.condition))).filter((c): c is string => c != null).sort()
    out.push({
      provider: name,
      success: last?.success ?? false,
      count: (last?.prices || []).length,
      conditions,
      attempts,
      error: last?.error,
    })
  }

  for (const row of out) {
    if (!row.success) throw new Error(`${row.provider} failed: ${row.error || 'unknown'}`)
    if (!row.count) throw new Error(`${row.provider} empty`)
    if (row.conditions.sort().join(',') !== need) {
      throw new Error(`${row.provider} missing conditions`)
    }
  }

  console.log(JSON.stringify(out, null, 2))
}

main()
