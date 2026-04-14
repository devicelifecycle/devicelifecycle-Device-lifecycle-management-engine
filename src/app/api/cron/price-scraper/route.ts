// ============================================================================
// PRICE SCRAPER PIPELINE CRON
// ============================================================================
// Runs scraper pipeline: GoRecell, Telus, Bell, Apple trade-in prices

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { readBooleanServerEnv, readServerEnv } from '@/lib/server-env'
import { runScraperPipeline } from '@/lib/scrapers'
import type { ScraperProviderId } from '@/lib/scrapers'
import { SCRAPER_PROVIDERS, getPersistedScraperImplementation } from '@/lib/scrapers/rollout-metadata'
import { runPostScrapeCleanup } from '@/lib/scrapers/post-scrape'
import { auditCompetitorPricesHealth } from '@/lib/scrapers/health-audit'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const VALID_PROVIDERS: ScraperProviderId[] = ['gorecell', 'telus', 'bell', 'universal', 'apple']

function parseProviders(request: NextRequest): ScraperProviderId[] | undefined {
  const providers = request.nextUrl.searchParams
    .get('providers')
    ?.split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider): provider is ScraperProviderId => VALID_PROVIDERS.includes(provider as ScraperProviderId))

  return providers && providers.length > 0 ? providers : undefined
}

function shouldRunPostProcessing(request: NextRequest, providers?: ScraperProviderId[]): boolean {
  const explicit = request.nextUrl.searchParams.get('post')
  if (explicit === '1' || explicit === 'true') return true
  if (explicit === '0' || explicit === 'false') return false
  return !providers || providers.length === 0
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

async function persistUniversalSourceHealth(
  supabase: ReturnType<typeof createServiceRoleClient>,
  result: Awaited<ReturnType<typeof runScraperPipeline>>
) {
  const universalResult = result.results.find(
    (item) => {
      const normalized = item.competitor_name.toLowerCase()
      return normalized === 'universal' || normalized === 'univercell'
    }
  )

  const sourceCandidate = universalResult?.prices.find((price) => {
    const raw = price.raw as { source?: string } | undefined
    return typeof raw?.source === 'string' && raw.source.length > 0
  })

  const sourceUrl = ((sourceCandidate?.raw as { source?: string } | undefined)?.source) || 'unknown'
  const fallbackUsed = sourceUrl.includes('universalcell.ca')
  const status = universalResult?.success ? 'success' : 'failed'
  const now = new Date().toISOString()

  await supabase
    .from('pricing_settings')
    .upsert([
      { setting_key: 'last_universal_source_url', setting_value: sourceUrl, description: 'Last Universal scraper source URL used' },
      { setting_key: 'last_universal_source_at', setting_value: now, description: 'Last time Universal scraper source was checked' },
      { setting_key: 'last_universal_source_status', setting_value: status, description: 'Last Universal scraper run status' },
      { setting_key: 'last_universal_source_fallback_used', setting_value: fallbackUsed ? 'true' : 'false', description: 'Whether Universal scraper used fallback URL' },
    ], { onConflict: 'setting_key' })
}

async function persistScraperRolloutHealth(
  supabase: ReturnType<typeof createServiceRoleClient>,
  result: Awaited<ReturnType<typeof runScraperPipeline>>,
  providers?: ScraperProviderId[]
) {
  const now = new Date().toISOString()
  const settingsPayload = [
    {
      setting_key: 'last_scraper_rollout_at',
      setting_value: now,
      description: 'Last time scraper rollout health metadata was updated',
    },
    {
      setting_key: 'last_scraper_rollout_partial_failure',
      setting_value: result.results.some((item) => !item.success) || result.errors.length > 0 ? 'true' : 'false',
      description: 'Whether the last scraper rollout run had any provider failures',
    },
  ]

  const providerFilter = providers && providers.length > 0 ? new Set<string>(providers) : null
  const providerScope = SCRAPER_PROVIDERS.filter((provider) => !providerFilter || providerFilter.has(provider.id))

  for (const provider of providerScope) {
    const providerResult = result.results.find((item) => item.competitor_name.toLowerCase() === provider.name.toLowerCase())
    const configuredImpl = provider.getConfiguredImpl()
    const persistedImpl = getPersistedScraperImplementation(provider.id)

    settingsPayload.push(
      {
        setting_key: `last_${provider.settingsPrefix}_scraper_at`,
        setting_value: now,
        description: `Last time ${provider.name} scraper metadata was updated`,
      },
      {
        setting_key: `last_${provider.settingsPrefix}_scraper_status`,
        setting_value: providerResult?.success ? 'success' : 'failed',
        description: `Last ${provider.name} scraper run status`,
      },
      {
        setting_key: `last_${provider.settingsPrefix}_scraper_count`,
        setting_value: String(providerResult?.prices.length ?? 0),
        description: `Last ${provider.name} scraper row count`,
      },
      {
        setting_key: `last_${provider.settingsPrefix}_scraper_duration_ms`,
        setting_value: String(providerResult?.duration_ms ?? 0),
        description: `Last ${provider.name} scraper duration in milliseconds`,
      },
      {
        setting_key: `last_${provider.settingsPrefix}_scraper_configured_impl`,
        setting_value: configuredImpl,
        description: `Configured ${provider.name} scraper implementation during the last run`,
      },
      {
        setting_key: `last_${provider.settingsPrefix}_scraper_persisted_impl`,
        setting_value: persistedImpl,
        description: `Implementation whose rows were persisted for ${provider.name} during the last run`,
      },
      {
        setting_key: `last_${provider.settingsPrefix}_scraper_error`,
        setting_value: providerResult?.error || '',
        description: `Last ${provider.name} scraper error, if any`,
      }
    )
  }

  await supabase.from('pricing_settings').upsert(settingsPayload, { onConflict: 'setting_key' })
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    const scraperEnabled = readBooleanServerEnv('PRICE_SCRAPER_ENABLED')
    const autoTrainingEnabled = readBooleanServerEnv('PRICE_SCRAPER_AUTO_TRAINING')

    if (!cronSecret) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!scraperEnabled) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'PRICE_SCRAPER_ENABLED is not true',
        timestamp: new Date().toISOString(),
      })
    }

    const supabase = createServiceRoleClient()
    const providers = parseProviders(request)
    const runPost = shouldRunPostProcessing(request, providers)
    const scrapeStartedAt = new Date().toISOString()
    // Scrape against our existing catalog instead of discovery mode so
    // competitor rows stay pinned to the correct catalog device.
    const result = await runScraperPipeline(undefined, supabase, false, providers)
    await persistUniversalSourceHealth(supabase, result)
    await persistScraperRolloutHealth(supabase, result, providers)

    let postScrape: Awaited<ReturnType<typeof runPostScrapeCleanup>> | null = null
    let healthAudit: Awaited<ReturnType<typeof auditCompetitorPricesHealth>> | null = null

    if (runPost) {
      // Clean up stale rows after the scrape completes.
      postScrape = await runPostScrapeCleanup(supabase, scrapeStartedAt)
      if (postScrape.errors.length > 0) {
        console.warn('[PostScrape] Errors:', postScrape.errors)
      }

      // Always audit row uniqueness/staleness after scrape+cleanup to surface drift early.
      healthAudit = await auditCompetitorPricesHealth(supabase)
    }

    // Optional auto-train after scraping so scraped data feeds into the AI model
    let trainingResult = null
    if (autoTrainingEnabled && runPost) {
      try {
        const { PricingTrainingService } = await import('@/services/pricing-training.service')
        trainingResult = await PricingTrainingService.train()
      } catch (trainErr) {
        console.warn('Post-scrape training failed:', trainErr)
      }
    }

    const failedScrapers = result.results.filter(r => !r.success).map(r => r.competitor_name)
    const partialFailure =
      failedScrapers.length > 0 ||
      result.errors.length > 0 ||
      (healthAudit?.duplicate_extra_rows ?? 0) > 0

    // Notify admins about price update (never fail cron response)
    try {
      const { NotificationService } = await import('@/services/notification.service')
      NotificationService.sendPriceUpdateNotification({
        source: 'scraper',
        total_updated: result.total_upserted,
        total_new: result.devices_created ?? 0,
        failed_scrapers: failedScrapers.length > 0 ? failedScrapers : undefined,
      }).catch(err => console.error('Price notification error:', err))
    } catch (notifyErr) {
      console.warn('Price notification import failed:', notifyErr)
    }

    return NextResponse.json({
      success: true,
      partial_failure: partialFailure,
      failed_scrapers: failedScrapers,
      providers,
      post_processing_ran: runPost,
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
        stale_rows_deleted: postScrape?.deleted ?? 0,
        benchmark_rows_seeded: postScrape?.seeded ?? 0,
        errors: postScrape?.errors ?? [],
      },
      data_health: healthAudit,
      training: trainingResult ? {
        baselines_upserted: trainingResult.baselines_upserted,
        sample_counts: trainingResult.sample_counts,
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

export async function POST(request: NextRequest) {
  return GET(request)
}
