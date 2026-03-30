// ============================================================================
// PRICING TRAINING CRON
// ============================================================================
// Trains our data-driven pricing model from internal data (orders, IMEI, sales).
// Reduces dependency on competitors and market_prices.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { readBooleanServerEnv, readServerEnv } from '@/lib/server-env'
import { PricingTrainingService } from '@/services/pricing-training.service'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    const trainingEnabled = readBooleanServerEnv('PRICING_TRAINING_ENABLED')

    if (!cronSecret) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!trainingEnabled) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'PRICING_TRAINING_ENABLED is not true',
        timestamp: new Date().toISOString(),
      })
    }

    const result = await PricingTrainingService.train()

    return NextResponse.json({
      success: true,
      baselines_upserted: result.baselines_upserted,
      condition_multipliers_updated: result.condition_multipliers_updated,
      data_sources_used: result.data_sources_used,
      sample_counts: result.sample_counts,
      errors: result.errors.slice(0, 10),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Pricing training error:', error)
    const { safeErrorMessage } = await import('@/lib/utils')
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Training failed') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
