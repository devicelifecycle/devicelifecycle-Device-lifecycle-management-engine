// ============================================================================
// POST-SCRAPE: CLEANUP + BENCHMARK SEEDING
// ============================================================================
// Called after every scraper run (cron + manual).
// 1. Purge stale competitor_prices rows — rows not updated in the latest scrape
//    that are older than STALE_DAYS are deleted (manual entries are kept).
// Benchmark seeding is intentionally disabled so live competitor rows are never
// overwritten by stale reference prices.

import type { SupabaseClient } from '@supabase/supabase-js'

const STALE_DAYS = 14 // delete auto-scraped rows not refreshed in this window

export async function runPostScrapeCleanup(
  supabase: SupabaseClient,
  scrapedAt: string  // ISO timestamp marking the start of this scrape run
): Promise<{ deleted: number; seeded: number; errors: string[] }> {
  const errors: string[] = []
  let deleted = 0
  let seeded = 0

  // ── 1. Purge stale rows ──────────────────────────────────────────────────
  // Delete competitor_prices rows where:
  //   - source is 'scraper' or 'auto' (not manual entries)
  //   - scraped_at is older than STALE_DAYS ago (not refreshed by this run)
  try {
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { count, error } = await supabase
      .from('competitor_prices')
      .delete({ count: 'exact' })
      .not('source', 'eq', 'manual')
      .lt('scraped_at', cutoff)

    if (error) {
      errors.push(`Stale cleanup: ${error.message}`)
    } else {
      deleted = count ?? 0
    }
  } catch (e) {
    errors.push(`Stale cleanup exception: ${e instanceof Error ? e.message : String(e)}`)
  }

  return { deleted, seeded, errors }
}
