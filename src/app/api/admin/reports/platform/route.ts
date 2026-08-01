// ============================================================================
// ADMIN PLATFORM REPORT API — global rollups (MRR/ARR, revenue, counts)
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { buildPlatformSummary } from '@/lib/platform-metrics'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceRoleClient()

  // Bounded sets are fetched as rows; large tables use COUNT(head) only.
  const [plansRes, tenantsRes, invoicesRes, custTotal, custActive, orderCount, deviceCount] = await Promise.all([
    supabase.from('subscription_plans').select('slug, monthly_price'),
    supabase.from('tenants').select('is_active, plan, type'),
    supabase.from('invoices').select('status, total').limit(5000),
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
