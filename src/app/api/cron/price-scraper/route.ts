// ============================================================================
// PRICE SCRAPER PIPELINE CRON
// ============================================================================
// Runs scraper pipeline: GoRecell, Telus, Bell, Apple trade-in prices

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { runScraperPipeline } from '@/lib/scrapers'

const CRON_SECRET = process.env.CRON_SECRET
const SCRAPER_ENABLED = process.env.PRICE_SCRAPER_ENABLED === 'true'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
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

    const result = await runScraperPipeline()

    return NextResponse.json({
      success: true,
      total_scraped: result.total_scraped,
      total_upserted: result.total_upserted,
      scrapers: result.results.map(r => ({
        name: r.competitor_name,
        success: r.success,
        count: r.prices.length,
        duration_ms: r.duration_ms,
      })),
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
