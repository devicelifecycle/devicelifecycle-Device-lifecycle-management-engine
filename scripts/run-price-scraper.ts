#!/usr/bin/env npx tsx
/**
 * Run the price scraper pipeline directly (no HTTP server needed).
 * Requires: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   npm run scrape:prices
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local', override: true })
config({ path: '.env', override: true })

import { runScraperPipeline } from '../src/lib/scrapers'
import type { ScraperProviderId } from '../src/lib/scrapers'

const VALID_PROVIDERS: ScraperProviderId[] = ['gorecell', 'telus', 'bell', 'universal', 'apple']

function parseProviders(): ScraperProviderId[] | undefined {
  const raw = process.argv.find((arg) => arg.startsWith('--providers='))?.split('=')[1]
  if (!raw) return undefined

  const providers = raw
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider): provider is ScraperProviderId => VALID_PROVIDERS.includes(provider as ScraperProviderId))

  return providers.length > 0 ? providers : undefined
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing env vars. Add to .env.local:')
    console.error('  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co')
    console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJ... (from Supabase Dashboard > Settings > API)')
    process.exit(1)
  }

  console.log('Starting price scraper pipeline...\n')
  const providers = parseProviders()
  if (providers?.length) {
    console.log(`Providers: ${providers.join(', ')}\n`)
  }

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  // Use non-discovery mode by default to avoid accidental catalog growth.
  const result = await runScraperPipeline(undefined, supabase, false, providers)

  console.log('Scraper complete.')
  console.log(`  Total scraped: ${result.total_scraped}`)
  console.log(`  Total upserted: ${result.total_upserted}`)
  if (result.devices_created != null) {
    console.log(`  Devices created: ${result.devices_created}`)
  }
  console.log('\nPer-scraper results:')
  for (const r of result.results) {
    const status = r.success ? '✓' : '✗'
    console.log(`  ${status} ${r.competitor_name}: ${r.prices.length} prices${r.error ? ` (${r.error})` : ''}`)
  }
  if (result.errors.length > 0) {
    console.log('\nErrors:')
    for (const e of result.errors.slice(0, 20)) {
      console.log(`  - ${e}`)
    }
    if (result.errors.length > 20) {
      console.log(`  ... and ${result.errors.length - 20} more`)
    }
  }
}

main().catch((err) => {
  console.error('Scraper failed:', err)
  process.exit(1)
})
