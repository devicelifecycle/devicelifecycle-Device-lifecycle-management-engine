// ============================================================================
// SLA CHECK CRON API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { SLAService } from '@/services/sla.service'
import { timingSafeEqual } from 'crypto'

// Protect cron endpoint with secret
const CRON_SECRET = process.env.CRON_SECRET

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret - always required. Fail closed if env var not set.
    if (!CRON_SECRET) {
      console.error('CRON_SECRET environment variable is not set. Cron endpoint disabled.')
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const expected = `Bearer ${CRON_SECRET}`
    if (!safeCompare(authHeader, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await SLAService.checkAllOrders()

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error running SLA check:', error)
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
