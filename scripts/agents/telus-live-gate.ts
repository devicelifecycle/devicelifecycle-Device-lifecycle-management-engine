#!/usr/bin/env npx tsx
/**
 * Strict Telus Live Gate
 *
 * Fails hard unless Telus live catalog scraping succeeds.
 *
 * Recommended env:
 * - TELUS_ENABLE_BROWSER_RUNNER=true
 * - TELUS_PROXY_SERVER=http://host:port (or socks5://...)
 * - TELUS_PROXY_USERNAME=...
 * - TELUS_PROXY_PASSWORD=...
 */

import { scrapeTelusFullCatalog } from '../../src/lib/scrapers/adapters/telus'

async function main() {
  const startedAt = Date.now()
  const result = await scrapeTelusFullCatalog()

  const conditions = Array.from(new Set((result.prices || []).map((p) => (p.condition || '').toLowerCase()).filter(Boolean)))
  const output = {
    gate: 'telus-live-strict',
    timestamp: new Date().toISOString(),
    pass: result.success && (result.prices?.length || 0) > 0,
    count: result.prices?.length || 0,
    conditions,
    duration_ms: Date.now() - startedAt,
    browser_runner_enabled: (process.env.TELUS_ENABLE_BROWSER_RUNNER || '').toLowerCase() === 'true',
    proxy_configured: Boolean(process.env.TELUS_PROXY_SERVER),
    error: result.error,
  }

  console.log(JSON.stringify(output, null, 0))

  if (!output.pass) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      gate: 'telus-live-strict',
      timestamp: new Date().toISOString(),
      pass: false,
      error: error instanceof Error ? error.message : String(error),
    })
  )
  process.exit(1)
})
