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
import { buildTradeInKpiSummary, type TriageRow } from '@/lib/trade-in-kpis'
export const dynamic = 'force-dynamic'

// Bounds for the trade-in KPI queries — a quarter is enough sample size for
// these rates without risking an unbounded table scan.
const KPI_WINDOW_DAYS = 90
const KPI_ROW_CAP = 5000

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceRoleClient()
  const { thisMonthStart, lastMonthStart } = monthBounds(new Date())
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const kpiWindowStart = new Date(Date.now() - KPI_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

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
    tradeInOrdersRes,
    triageRowsRes,
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
    // Trade-in quote process KPIs (client spec, section 3) — bounded to the window/cap above.
    supabase.from('orders')
      .select('status, submitted_at, received_at')
      .eq('type', 'trade_in')
      .gte('created_at', kpiWindowStart)
      .limit(KPI_ROW_CAP),
    supabase.from('triage_results')
      .select('condition_changed, exception_required, exception_approved, exception_approved_by_id, triaged_at, order:orders(received_at)')
      .gte('created_at', kpiWindowStart)
      .limit(KPI_ROW_CAP),
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

  // Trade-in KPIs: resolve the role of whoever decided each exception (needed
  // to tell a customer dispute apart from a COE/admin rejection) via one
  // bounded lookup, then shape the rows into what trade-in-kpis.ts expects.
  const triageRows = triageRowsRes.data ?? []
  const approverIds = [...new Set(
    triageRows.map((r) => r.exception_approved_by_id as string | null).filter((id): id is string => !!id),
  )]
  const { data: approvers } = approverIds.length
    ? await supabase.from('users').select('id, role').in('id', approverIds)
    : { data: [] }
  const approverRoleById = new Map((approvers ?? []).map((a) => [a.id as string, a.role as string]))

  const shapedTriageRows: TriageRow[] = triageRows.map((r) => {
    // PostgREST returns an object for this many-to-one embed; supabase-js's
    // generic types it as an array, so normalize defensively (same pattern as
    // the users-route customer-plan embed).
    const embeddedOrder = r.order as { received_at?: string | null } | { received_at?: string | null }[] | null
    const order = Array.isArray(embeddedOrder) ? embeddedOrder[0] ?? null : embeddedOrder
    return {
      condition_changed: r.condition_changed as boolean | null,
      exception_required: r.exception_required as boolean | null,
      exception_approved: r.exception_approved as boolean | null,
      exception_approved_by_role: r.exception_approved_by_id ? approverRoleById.get(r.exception_approved_by_id as string) ?? null : null,
      triaged_at: r.triaged_at as string | null,
      order_received_at: order?.received_at ?? null,
    }
  })

  const tradeInKpis = buildTradeInKpiSummary(tradeInOrdersRes.data ?? [], shapedTriageRows)

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

  return NextResponse.json({ data: { ...summary, tradeInKpis } })
}
