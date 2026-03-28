#!/usr/bin/env npx tsx
/**
 * Agent 2 — Condition Scenario Matrix
 * For one common device (iPhone 15 Pro 128GB), run Bell/Telus/UniverCell targeted scrapers
 * for excellent, good, fair, broken. Fail if any condition missing or any value null.
 * Output condition→price matrix.
 */

import { scrapeBell } from '../../src/lib/scrapers/adapters/bell'
import { scrapeTelus } from '../../src/lib/scrapers/adapters/telus'
import { scrapeUniversal } from '../../src/lib/scrapers/adapters/universal'
import type { DeviceToScrape, ScraperResult } from '../../src/lib/scrapers/types'

const TEST_DEVICE: DeviceToScrape = {
  make: 'Apple',
  model: 'iPhone 15 Pro',
  storage: '128GB',
}

const CONDITIONS = ['excellent', 'good', 'fair', 'broken'] as const
const PROVIDERS = [
  { id: 'bell', name: 'Bell', fn: scrapeBell },
  { id: 'telus', name: 'Telus', fn: scrapeTelus },
  { id: 'univercell', name: 'UniverCell', fn: scrapeUniversal },
] as const

type Condition = (typeof CONDITIONS)[number]

interface MatrixRow {
  condition: Condition
  bell: number | null
  telus: number | null
  univercell: number | null
}

async function main() {
  const deviceKey = `${TEST_DEVICE.make} ${TEST_DEVICE.model} ${TEST_DEVICE.storage}`
  const matrix: Record<Condition, { Bell: number | null; Telus: number | null; UniverCell: number | null }> = {
    excellent: { Bell: null, Telus: null, UniverCell: null },
    good: { Bell: null, Telus: null, UniverCell: null },
    fair: { Bell: null, Telus: null, UniverCell: null },
    broken: { Bell: null, Telus: null, UniverCell: null },
  }

  const results: ScraperResult[] = []
  for (const provider of PROVIDERS) {
    const devices: DeviceToScrape[] = CONDITIONS.map((c) => ({ ...TEST_DEVICE, condition: c }))
    try {
      const result = await provider.fn(devices)
      results.push(result)
      for (const p of result.prices) {
        const cond = (p.condition || 'good').toLowerCase() as Condition
        if (CONDITIONS.includes(cond) && p.trade_in_price != null) {
          const providerName = provider.name as 'Bell' | 'Telus' | 'UniverCell'
          matrix[cond][providerName] = p.trade_in_price
        }
      }
    } catch (e) {
      results.push({
        competitor_name: provider.name,
        prices: [],
        success: false,
        error: e instanceof Error ? e.message : String(e),
        duration_ms: 0,
      })
    }
  }

  let pass = true
  const missing: string[] = []
  for (const cond of CONDITIONS) {
    for (const prov of ['Bell', 'Telus', 'UniverCell'] as const) {
      if (matrix[cond][prov] == null) {
        pass = false
        missing.push(`${cond}:${prov}`)
      }
    }
  }

  const output = {
    agent: 'agent2-condition-matrix',
    timestamp: new Date().toISOString(),
    device: deviceKey,
    pass,
    matrix,
    missing: missing.length > 0 ? missing : undefined,
    fail_reason: pass ? undefined : `Missing or null: ${missing.join(', ')}`,
  }

  console.log(JSON.stringify(output, null, 0))
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  console.log(
    JSON.stringify({
      agent: 'agent2-condition-matrix',
      timestamp: new Date().toISOString(),
      pass: false,
      error: e instanceof Error ? e.message : String(e),
    })
  )
  process.exit(1)
})
