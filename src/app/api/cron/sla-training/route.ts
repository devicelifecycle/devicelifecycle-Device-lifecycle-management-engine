// ============================================================================
// SLA TRAINING CRON
// ============================================================================
// Retrains the SLA early-warning baselines (trained_sla_baselines) from
// historical order timestamps. Mirrors /api/cron/pricing-training.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { readServerEnv } from '@/lib/server-env'
import { SlaTrainingService } from '@/services/sla-training.service'
import { logCronSuccess, logCronFailure } from '@/lib/cron-logging'

const CRON_NAME = 'sla-training'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(request: NextRequest) {
  const startedAt = new Date()
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    if (!cronSecret) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await SlaTrainingService.train()

    await logCronSuccess(CRON_NAME, startedAt, {
      baselines_upserted: result.baselines_upserted,
      errors: result.errors.length,
    })
    return NextResponse.json({
      success: true,
      baselines_upserted: result.baselines_upserted,
      sample_counts: result.sample_counts,
      errors: result.errors.slice(0, 10),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('SLA training error:', error)
    await logCronFailure(CRON_NAME, startedAt, error)
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
