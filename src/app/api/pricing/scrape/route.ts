// ============================================================================
// ADMIN: MANUAL PRICE SCRAPER TRIGGER
// ============================================================================
// Runs the price scraper pipeline. Requires admin or coe_manager.
// Uses session auth (server client) — RLS allows writes for these roles.

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { runScraperPipeline } from '@/lib/scrapers'

export async function POST() {
  try {
    const supabase = createServerSupabaseClient()
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

    const result = await runScraperPipeline(undefined, supabase)

    // Auto-train after scraping so new data feeds into the AI model immediately
    let trainingResult = null
    try {
      const { PricingTrainingService } = await import('@/services/pricing-training.service')
      trainingResult = await PricingTrainingService.train()
    } catch (trainErr) {
      console.warn('Post-scrape training failed:', trainErr)
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
