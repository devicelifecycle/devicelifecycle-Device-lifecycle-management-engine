// ============================================================================
// AUDIT LOG API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AuditService } from '@/services/audit.service'
import type { AuditAction } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format')

    const filters = {
      action: (searchParams.get('action') || undefined) as AuditAction | undefined,
      entity_type: searchParams.get('entity_type') || undefined,
      page: Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000),
      limit: Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100),
    }

    // CSV export
    if (format === 'csv') {
      const csv = await AuditService.exportToCSV(filters)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename=audit-log-${new Date().toISOString().split('T')[0]}.csv`,
        },
      })
    }

    const result = await AuditService.getAuditLogs(filters)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    )
  }
}
