// ============================================================================
// POST-SCRAPE: CLEANUP + BENCHMARK SEEDING
// ============================================================================
// Called after every scraper run (cron + manual).
// 1. Purge stale competitor_prices rows — rows not updated in the latest scrape
//    that are older than STALE_DAYS are deleted (manual entries are kept).
// 2. Seed benchmark reference prices for the 16 known devices from our
//    carrier/GoRecell table so catalog pricing is never empty.

import type { SupabaseClient } from '@supabase/supabase-js'
import { MARKET_REFERENCE_PRICES } from '@/lib/constants'

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

  // ── 2. Seed benchmark reference prices ──────────────────────────────────
  // For each of the 16 benchmark devices, find matching device_catalog rows
  // and upsert Bell, Telus, GoRecell Good/Fair prices if the device exists.
  try {
    for (const ref of MARKET_REFERENCE_PRICES) {
      // Find all catalog devices matching any of the patterns
      for (const pattern of ref.patterns) {
        const words = pattern.split(' ').filter(Boolean)
        if (words.length === 0) continue

        // Search by the most specific words
        const searchTerm = pattern
        const { data: devices } = await supabase
          .from('device_catalog')
          .select('id, make, model')
          .ilike('model', `%${words[words.length - 1]}%`)
          .eq('is_active', true)
          .limit(10)

        if (!devices || devices.length === 0) continue

        for (const device of devices) {
          const label = `${device.make} ${device.model}`.toLowerCase()
          if (!label.includes(pattern.toLowerCase())) continue

          // Upsert Bell, Telus, GoRecell Good, GoRecell Fair for 128GB (standard reference storage)
          const entries = [
            { competitor_name: 'Bell',    condition: 'good' as const, trade_in_price: ref.bell,          sell_price: null },
            { competitor_name: 'Telus',   condition: 'good' as const, trade_in_price: ref.telus,         sell_price: null },
            { competitor_name: 'GoRecell', condition: 'good' as const, trade_in_price: ref.goRecellGood, sell_price: null },
            { competitor_name: 'GoRecell', condition: 'fair' as const, trade_in_price: ref.goRecellFair, sell_price: null },
          ]

          for (const entry of entries) {
            const { error: upsertErr } = await supabase
              .from('competitor_prices')
              .upsert({
                device_id: device.id,
                storage: '128GB',
                competitor_name: entry.competitor_name,
                condition: entry.condition,
                trade_in_price: entry.trade_in_price,
                sell_price: entry.sell_price,
                source: 'benchmark_seed',
                scraped_at: scrapedAt,
                retrieved_at: scrapedAt,
              }, {
                onConflict: 'device_id,storage,competitor_name,condition',
                ignoreDuplicates: false,
              })

            if (upsertErr) {
              errors.push(`Seed ${device.make} ${device.model} ${entry.competitor_name} ${entry.condition}: ${upsertErr.message}`)
            } else {
              seeded++
            }
          }
          break // matched — don't re-seed same device from another pattern
        }
      }
    }
  } catch (e) {
    errors.push(`Benchmark seeding exception: ${e instanceof Error ? e.message : String(e)}`)
  }

  return { deleted, seeded, errors }
}
