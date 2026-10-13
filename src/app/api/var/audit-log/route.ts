// ============================================================================
// VAR AUDIT LOG — tenant-scoped view
// ============================================================================
// Mirrors /api/admin/audit-log but scopes to the VAR's own tenant. Uses the
// service-role client to read audit_logs (which have no tenant_id column) by
// joining through users.tenant_id.

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sanitizeSearchInput } from '@/lib/utils'
import type { AuditAction } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await requirePermission('audit.view')
  if ('error' in guard) return guard.error

  if (!guard.auth.tenantId) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 400 })
  }

  const searchParams = request.nextUrl.searchParams
  const page = Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100)
  const offset = (page - 1) * limit

  const actions = searchParams.getAll('action').filter(Boolean) as AuditAction[]
  const entityType = searchParams.get('entity_type') || undefined
  const search = searchParams.get('search') || undefined
  const format = searchParams.get('format')

  const supabase = createServiceRoleClient()

  // Get user IDs belonging to this tenant
  const { data: tenantUsers } = await supabase
    .from('users')
    .select('id')
    .eq('tenant_id', guard.auth.tenantId)

  if (!tenantUsers || tenantUsers.length === 0) {
    if (format === 'csv') {
      return new NextResponse('timestamp,action,entity_type,entity_id,user_email\n', {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename=audit-log-${new Date().toISOString().split('T')[0]}.csv`,
        },
      })
    }
    return NextResponse.json({ data: [], total: 0, page, totalPages: 0 })
  }

  const userIds = tenantUsers.map((u) => u.id)

  let query = supabase
    .from('audit_logs')
    .select('*, user:users(id, email, full_name)', { count: 'exact' })
    .in('user_id', userIds)

  if (actions.length === 1) query = query.eq('action', actions[0])
  else if (actions.length > 1) query = query.in('action', actions)
  if (entityType) query = query.eq('entity_type', entityType)
  if (search) {
    const s = sanitizeSearchInput(search)
    query = query.or(`entity_id.ilike.%${s}%,ip_address.ilike.%${s}%`)
  }

  // CSV export — unbounded (up to 10k rows)
  if (format === 'csv') {
    const { data, error } = await query
      .order('timestamp', { ascending: false })
      .limit(10000)

    if (error) {
      return NextResponse.json({ error: 'Failed to export audit log' }, { status: 500 })
    }

    const rows = (data || []) as Array<{
      timestamp: string
      action: string
      entity_type: string
      entity_id: string
      user: { email?: string; full_name?: string } | null
      ip_address?: string
    }>

    const csvLines = ['timestamp,action,entity_type,entity_id,user,ip_address']
    for (const row of rows) {
      const userName = row.user?.full_name || row.user?.email || ''
      csvLines.push(
        [row.timestamp, row.action, row.entity_type, row.entity_id, userName, row.ip_address || '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
    }

    return new NextResponse(csvLines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=audit-log-${new Date().toISOString().split('T')[0]}.csv`,
      },
    })
  }

  // Paginated JSON
  const { data, error, count } = await query
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('Error fetching VAR audit logs:', error)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  })
}
