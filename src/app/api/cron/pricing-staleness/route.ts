// ============================================================================
// PRICING STALENESS MONITOR CRON API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { readBooleanServerEnv, readServerEnv } from '@/lib/server-env'
import { PricingHealthService } from '@/services/pricing-health.service'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    const monitorEnabled = readBooleanServerEnv('PRICING_STALENESS_MONITOR_ENABLED', true)

    if (!cronSecret) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!monitorEnabled) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'PRICING_STALENESS_MONITOR_ENABLED is false',
        timestamp: new Date().toISOString(),
      })
    }

    const result = await PricingHealthService.checkCompetitorPriceStaleness()
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Pricing staleness cron error:', error)
    const { safeErrorMessage } = await import('@/lib/utils')
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Pricing staleness check failed') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
