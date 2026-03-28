#!/usr/bin/env npx tsx
/**
 * Deep Catalog — Scenario Matrix Agent
 * Run Bell/Telus/UniverCell targeted scrapers for one device across all conditions.
 */

import { scrapeBell } from '../../src/lib/scrapers/adapters/bell'
import { scrapeTelus } from '../../src/lib/scrapers/adapters/telus'
import { scrapeUniversal } from '../../src/lib/scrapers/adapters/universal'

const conditions = ['excellent', 'good', 'fair', 'broken'] as const
const req = conditions.map((condition) => ({
  make: 'Apple',
  model: 'iPhone 15 Pro',
  storage: '128GB',
  condition,
}))

async function main() {
  const [b, t, u] = await Promise.all([
    scrapeBell(req),
    scrapeTelus(req),
    scrapeUniversal(req),
  ])
  const out = { bell: b.prices, telus: t.prices, univercell: u.prices } as const

  for (const [k, v] of Object.entries(out)) {
    const got = Array.from(new Set(v.map((p: { condition?: string }) => p.condition))).filter((c): c is string => c != null).sort().join(',')
    if (got !== [...conditions].sort().join(',')) throw new Error(`${k} missing conditions`)
    if (v.some((p: { trade_in_price?: number | null }) => p.trade_in_price == null)) {
      throw new Error(`${k} has null price`)
    }
  }

  const summary = Object.fromEntries(
    Object.entries(out).map(([k, v]) => [
      k,
      v.map((p: { condition?: string; trade_in_price?: number | null }) => ({
        c: p.condition,
        v: p.trade_in_price,
      })),
    ])
  )
  console.log(JSON.stringify({ ok: true, summary }, null, 2))
}

main()
