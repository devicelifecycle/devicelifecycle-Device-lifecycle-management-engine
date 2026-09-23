// ============================================================================
// RETENTION CRON — applies each tenant's retention policy
// ============================================================================
// Runs daily. Deletes nothing for a tenant that has not set a policy: every
// data class defaults to "keep forever", so this is inert until an operator
// enters a number on the VAR's page. Each class of each tenant writes a
// retention_runs audit row, including zero-row and failed outcomes.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { readServerEnv } from '@/lib/server-env'
import { logCronSuccess, logCronFailure } from '@/lib/cron-logging'
import { executeRetention } from '@/lib/retention-execute'

export const dynamic = 'force-dynamic'
const CRON_NAME = 'retention'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(request: NextRequest) {
  const startedAt = new Date()
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    if (!cronSecret) {
      console.error('CRON_SECRET not set — retention cron disabled')
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await executeRetention(createServiceRoleClient(), 'cron')
    const failures = result.lines.filter((l) => l.error).length

    await logCronSuccess(CRON_NAME, startedAt, {
      tenantsWithPolicy: new Set(result.lines.map((l) => l.tenantId)).size,
      classesProcessed: result.lines.length,
      totalDeleted: result.totalDeleted,
      failures,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Retention cron failed:', error)
    await logCronFailure(CRON_NAME, startedAt, error)
    return NextResponse.json({ error: 'Retention run failed' }, { status: 500 })
  }
}
