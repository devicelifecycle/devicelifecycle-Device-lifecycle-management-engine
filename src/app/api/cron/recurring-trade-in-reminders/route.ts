// ============================================================================
// RECURRING TRADE-IN REMINDERS CRON
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { readServerEnv } from '@/lib/server-env'
import { RecurringTradeInService } from '@/services/recurring-trade-in.service'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    if (!cronSecret) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await RecurringTradeInService.processDueReminders()

    return NextResponse.json({
      success: true,
      reminded: result.reminded,
      errors: result.errors.slice(0, 10),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Recurring trade-in reminder error:', error)
    const { safeErrorMessage } = await import('@/lib/utils')
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to process reminders') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
