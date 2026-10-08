// ============================================================================
// ADMIN PLATFORM REPORT API — global rollups (MRR/ARR, revenue, counts)
// ============================================================================

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildPlatformSummary } from '@/lib/platform-metrics'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requirePermission('reports.view')
  if ('error' in guard) return guard.error

  const supabase = createServiceRoleClient()

  // Bounded sets are fetched as rows; large tables use COUNT(head) only.
  const [plansRes, tenantsRes, invoicesRes, custTotal, custActive, orderCount, deviceCount] = await Promise.all([
    supabase.from('subscription_plans').select('slug, monthly_price'),
    supabase.from('tenants').select('is_active, plan, type'),
    // Ordered so a past-cap truncation is deterministic (most recent invoices
    // kept) instead of an arbitrary, unordered subset of rows.
    supabase.from('invoices').select('status, total').order('created_at', { ascending: false }).limit(5000),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('customers').select('id', { count: 'exact', head: true }).neq('is_active', false),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('device_catalog').select('id', { count: 'exact', head: true }),
  ])

  const planPriceBySlug: Record<string, number> = {}
  for (const p of plansRes.data ?? []) planPriceBySlug[p.slug as string] = (p.monthly_price as number) ?? 0

  const total = custTotal.count ?? 0
  const active = custActive.count ?? 0

  const summary = buildPlatformSummary({
    tenants: tenantsRes.data ?? [],
    planPriceBySlug,
    invoices: invoicesRes.data ?? [],
    customers: { total, active, inactive: Math.max(0, total - active) },
    orderCount: orderCount.count ?? 0,
    deviceCount: deviceCount.count ?? 0,
  })

  return NextResponse.json({ data: summary })
}
