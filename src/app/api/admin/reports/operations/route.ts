// ============================================================================
// ADMIN OPERATIONS REPORT API — usage, licenses, active/inactive, security
// ============================================================================
// Companion to the platform (revenue) report. Every metric comes from real
// rows; there are no fabricated zeros — storage and API-call metering have no
// runtime source yet and are surfaced as "Not yet metered" in the UI.
//
// Security note: failed logins are NOT auditable today because authentication
// happens client-side against Supabase Auth directly (src/hooks/useAuth.ts
// signInWithPassword) — there is no server login path that could record the
// attempt, so this report deliberately omits a failed-login number.

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  monthBounds,
  splitCounts,
  buildLicenseTable,
  buildOperationsSummary,
  type NotificationBreakdown,
} from '@/lib/operations-metrics'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceRoleClient()
  const { thisMonthStart, lastMonthStart } = monthBounds(new Date())
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Bounded sets as rows; large tables via COUNT(head) only.
  const [
    ordersThisMonth,
    ordersLastMonth,
    custTotal,
    custActive,
    usersTotal,
    usersActive,
    activeVarsRes,
    notifEmailSent,
    notifEmailFailed,
    notifSmsSent,
    notifSmsFailed,
  ] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', thisMonthStart),
    supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', lastMonthStart).lt('created_at', thisMonthStart),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('customers').select('id', { count: 'exact', head: true }).neq('is_active', false),
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).neq('is_active', false),
    supabase.from('tenants').select('id, name, settings').eq('type', 'var').neq('is_active', false),
    supabase.from('notification_attempts').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'sent').gte('created_at', thirtyDaysAgo),
    supabase.from('notification_attempts').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', 'failed').gte('created_at', thirtyDaysAgo),
    supabase.from('notification_attempts').select('id', { count: 'exact', head: true }).eq('channel', 'sms').eq('status', 'sent').gte('created_at', thirtyDaysAgo),
    supabase.from('notification_attempts').select('id', { count: 'exact', head: true }).eq('channel', 'sms').eq('status', 'failed').gte('created_at', thirtyDaysAgo),
  ])

  const vars = activeVarsRes.data ?? []
  // Per-VAR customer totals: one bounded COUNT per active VAR.
  const counts = await Promise.all(
    vars.map((v) => supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', v.id as string)),
  )
  const customersByTenant: Record<string, number> = {}
  vars.forEach((v, i) => { customersByTenant[v.id as string] = counts[i].count ?? 0 })

  const notifications: NotificationBreakdown[] = [
    { channel: 'email', status: 'sent', count: notifEmailSent.count ?? 0 },
    { channel: 'email', status: 'failed', count: notifEmailFailed.count ?? 0 },
    { channel: 'sms', status: 'sent', count: notifSmsSent.count ?? 0 },
    { channel: 'sms', status: 'failed', count: notifSmsFailed.count ?? 0 },
  ]

  const summary = buildOperationsSummary({
    ordersThisMonth: ordersThisMonth.count ?? 0,
    ordersLastMonth: ordersLastMonth.count ?? 0,
    customersTotal: custTotal.count ?? 0,
    activeVars: vars.length,
    notifications,
    users: splitCounts(usersTotal.count ?? 0, usersActive.count ?? 0),
    customersSplit: splitCounts(custTotal.count ?? 0, custActive.count ?? 0),
    licenses: buildLicenseTable(vars as Array<{ id: string; name?: string | null; settings?: unknown }>, customersByTenant),
  })

  return NextResponse.json({ data: summary })
}
