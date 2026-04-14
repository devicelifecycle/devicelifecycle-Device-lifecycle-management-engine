// ============================================================================
// ADMIN: MANUAL PRICE SCRAPER TRIGGER
// ============================================================================
// Runs the price scraper pipeline. Requires admin or coe_manager.
// Uses service-role client to bypass RLS and ensure scraper can always write
// to competitor_prices and device_catalog (auth is checked first).

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { runScraperPipeline } from '@/lib/scrapers'
import type { ScraperProviderId } from '@/lib/scrapers'
import { runPostScrapeCleanup } from '@/lib/scrapers/post-scrape'
import { auditCompetitorPricesHealth } from '@/lib/scrapers/health-audit'
export const dynamic = 'force-dynamic'

const VALID_PROVIDERS: ScraperProviderId[] = ['gorecell', 'telus', 'bell', 'universal', 'apple']

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const serviceSupabase = createServiceRoleClient()
    const scrapeStartedAt = new Date().toISOString()
    const providers = request.nextUrl.searchParams
      .get('providers')
      ?.split(',')
      .map((provider) => provider.trim().toLowerCase())
      .filter((provider): provider is ScraperProviderId => VALID_PROVIDERS.includes(provider as ScraperProviderId))

    // Scrape against our existing catalog instead of discovery mode so
    // competitor rows stay pinned to the correct catalog device.
    const result = await runScraperPipeline(undefined, serviceSupabase, false, providers?.length ? providers : undefined)

    // Clean up stale rows after the scrape completes.
    const postScrape = await runPostScrapeCleanup(serviceSupabase, scrapeStartedAt)
    const healthAudit = await auditCompetitorPricesHealth(serviceSupabase)

    let trainingResult = null
    const shouldTrainInline =
      request.nextUrl.searchParams.get('include_training') === 'true' ||
      process.env.MANUAL_PRICE_SCRAPER_AUTO_TRAINING === 'true'

    if (shouldTrainInline) {
      try {
        const { PricingTrainingService } = await import('@/services/pricing-training.service')
        trainingResult = await PricingTrainingService.train()
      } catch (trainErr) {
        console.warn('Post-scrape training failed:', trainErr)
      }
    } else {
      trainingResult = {
        skipped: true,
        reason: 'Manual scrape skips synchronous training. Run training from the Training Data tab or POST /api/pricing/train.',
      }
    }

    return NextResponse.json({
      success: true,
      total_scraped: result.total_scraped,
      total_upserted: result.total_upserted,
      devices_created: result.devices_created ?? 0,
      scrapers: result.results.map(r => ({
        name: r.competitor_name,
        success: r.success,
        count: r.prices.length,
        duration_ms: r.duration_ms,
      })),
      cleanup: {
        stale_rows_deleted: postScrape.deleted,
        benchmark_rows_seeded: postScrape.seeded,
      },
      data_health: healthAudit,
      training: trainingResult ? {
        ...(trainingResult && 'baselines_upserted' in trainingResult
          ? {
              baselines_upserted: trainingResult.baselines_upserted,
              sample_counts: trainingResult.sample_counts,
            }
          : trainingResult),
      } : null,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Price scraper error:', error)
    const { safeErrorMessage } = await import('@/lib/utils')
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Scraper failed') },
      { status: 500 }
    )
  }
}
