// ============================================================================
// SLA CHECK CRON API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { SLAService } from '@/services/sla.service'
import { readServerEnv } from '@/lib/server-env'
import { timingSafeEqual } from 'crypto'
import { logCronSuccess, logCronFailure } from '@/lib/cron-logging'
import logger from '@/lib/logger'

const CRON_NAME = 'sla-check'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(request: NextRequest) {
  const startedAt = new Date()
  try {
    const cronSecret = readServerEnv('CRON_SECRET')

    // Verify cron secret - always required. Fail closed if env var not set.
    if (!cronSecret) {
      logger.error({ cron: CRON_NAME }, 'CRON_SECRET not set — cron endpoint disabled')
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const expected = `Bearer ${cronSecret}`
    if (!safeCompare(authHeader, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await SLAService.checkAllOrders()

    await logCronSuccess(CRON_NAME, startedAt, { ...result })
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error({ err: error, cron: CRON_NAME }, 'SLA check cron failed')
    await logCronFailure(CRON_NAME, startedAt, error)
    return NextResponse.json(
      { error: 'Failed to run SLA check' },
      { status: 500 }
    )
  }
}

// Also allow POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
