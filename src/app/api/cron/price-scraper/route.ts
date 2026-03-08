// ============================================================================
// PRICE SCRAPER PIPELINE CRON
// ============================================================================
// Runs scraper pipeline: GoRecell, Telus, Bell, Apple trade-in prices

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { runScraperPipeline } from '@/lib/scrapers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const CRON_SECRET = process.env.CRON_SECRET
const SCRAPER_ENABLED = process.env.PRICE_SCRAPER_ENABLED === 'true'
const AUTO_TRAINING_ENABLED = process.env.PRICE_SCRAPER_AUTO_TRAINING === 'true'

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

export async function GET(request: NextRequest) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${CRON_SECRET}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!SCRAPER_ENABLED) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'PRICE_SCRAPER_ENABLED is not true',
        timestamp: new Date().toISOString(),
      })
    }

    const supabase = createServiceRoleClient()
    const result = await runScraperPipeline(undefined, supabase)
    await persistUniversalSourceHealth(supabase, result)

    // Optional auto-train after scraping so scraped data feeds into the AI model
    let trainingResult = null
    if (AUTO_TRAINING_ENABLED) {
      try {
        const { PricingTrainingService } = await import('@/services/pricing-training.service')
        trainingResult = await PricingTrainingService.train()
      } catch (trainErr) {
        console.warn('Post-scrape training failed:', trainErr)
      }
    }

    const failedScrapers = result.results.filter(r => !r.success).map(r => r.competitor_name)
    const partialFailure = failedScrapers.length > 0 || result.errors.length > 0

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
      total_scraped: result.total_scraped,
      total_upserted: result.total_upserted,
      devices_created: result.devices_created ?? 0,
      scrapers: result.results.map(r => ({
        name: r.competitor_name,
        success: r.success,
        count: r.prices.length,
        duration_ms: r.duration_ms,
      })),
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
