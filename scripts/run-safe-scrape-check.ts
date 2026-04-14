#!/usr/bin/env npx tsx

import { createClient } from '@supabase/supabase-js'
import { runScraperPipeline } from '../src/lib/scrapers'
import { runPostScrapeCleanup } from '../src/lib/scrapers/post-scrape'
import { auditCompetitorPricesHealth } from '../src/lib/scrapers/health-audit'
import { normalizeCompetitorName } from '../src/lib/utils'

const ALLOWED_COMPETITORS = new Set([
  'Bell',
  'Telus',
  'GoRecell',
  'UniverCell',
  'Apple Trade-In',
  'International',
])

type NameRow = {
  competitor_name: string | null
}

type AppleMismatchRow = {
  competitor_name: string | null
  device: {
    make: string | null
    model: string | null
  } | null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const beforeAudit = await auditCompetitorPricesHealth(supabase)

  const scrapeStartedAt = new Date().toISOString()
  const scrapeResult = await runScraperPipeline(undefined, supabase, false)
  const cleanup = await runPostScrapeCleanup(supabase, scrapeStartedAt)
  const afterAudit = await auditCompetitorPricesHealth(supabase)

  const { data: rawNames, error: namesError } = await supabase
    .from('competitor_prices')
    .select('competitor_name')

  if (namesError) {
    throw new Error(`Failed to query competitor names: ${namesError.message}`)
  }

  const distinctRawNames = Array.from(new Set((rawNames ?? []).map((r: NameRow) => (r.competitor_name || '').trim()).filter(Boolean)))
  const distinctCanonical = Array.from(new Set(distinctRawNames.map((name) => normalizeCompetitorName(name))))

  const unexpectedCanonical = distinctCanonical.filter((name) => !ALLOWED_COMPETITORS.has(name))

  // Apple competitor should map to Apple devices only.
  const { data: appleRows, error: appleError } = await supabase
    .from('competitor_prices')
    .select('competitor_name, device:device_catalog(make, model)')
    .eq('competitor_name', 'Apple Trade-In')

  if (appleError) {
    throw new Error(`Failed to validate Apple competitor mappings: ${appleError.message}`)
  }

  const appleNonApple = (appleRows ?? []).filter((row: AppleMismatchRow) => {
    const make = (row.device?.make || '').toLowerCase().trim()
    return make !== 'apple'
  })

  const result = {
    run_at: new Date().toISOString(),
    scrape: {
      total_scraped: scrapeResult.total_scraped,
      total_upserted: scrapeResult.total_upserted,
      errors: scrapeResult.errors,
    },
    cleanup,
    audit_before: beforeAudit,
    audit_after: afterAudit,
    competitor_name_check: {
      distinct_raw_names: distinctRawNames.sort(),
      distinct_canonical_names: distinctCanonical.sort(),
      unexpected_canonical_names: unexpectedCanonical,
    },
    mapping_checks: {
      apple_trade_in_non_apple_rows: appleNonApple.length,
      sample_non_apple_rows: appleNonApple.slice(0, 10).map((row) => ({
        competitor_name: row.competitor_name,
        make: row.device?.make,
        model: row.device?.model,
      })),
    },
  }

  console.log(JSON.stringify(result, null, 2))

  if (unexpectedCanonical.length > 0 || appleNonApple.length > 0 || afterAudit.duplicate_extra_rows > 0) {
    process.exitCode = 2
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
