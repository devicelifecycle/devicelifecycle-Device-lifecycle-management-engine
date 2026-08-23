// ============================================================================
// VAR REPORTS — roll-up of rep / customer / order performance for one tenant
// ============================================================================
// Feeds the caller's scoped rep roster into buildVarRollup (the pure
// aggregator in src/lib/var-rollup.ts) and returns per-rep and per-region
// aggregates. Scoping mirrors GET /api/var/team: an Entity Admin reports on
// the whole tenant's reps, a Regional Manager only their region's, a Sales
// Rep only themselves; optional ?region= / ?rep_id= narrow that scoped base
// list further.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { delegationLevel } from '@/lib/delegation'
import { PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'
import { buildVarRollup } from '@/lib/var-rollup'
export const dynamic = 'force-dynamic'

const VAR_CONSOLE_ROLES = new Set([
  'admin', 'var_entity_admin', 'var_regional_manager', 'var_sales_rep',
])

// A tenant's rep roster is small, but its order history is not — bound both
// fetches like the other aggregate report routes do.
const MAX_CUSTOMERS = 5000
const MAX_ORDERS = 5000

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const { profile, effectiveRole, tenantId } = auth

  if (!VAR_CONSOLE_ROLES.has(effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // A platform admin has no VAR of their own, so they report on the platform
  // tenant's own roster (the tenant their auth context resolves to) — never
  // across every VAR's data at once.
  const scopeTenantId = tenantId ?? PLATFORM_TENANT_ID

  // Same query shape as GET /api/var/team's team list, narrowed to sales reps:
  // those are who a roll-up reports on.
  const svc = createServiceRoleClient()
  let query = svc
    .from('users')
    .select('id, full_name, region')
    .eq('tenant_id', scopeTenantId)
    .eq('role', 'var_sales_rep')

  const level = delegationLevel(effectiveRole)
  if (level === 'region') {
    // A regional manager with no region set sees nothing rather than everything.
    if (!profile.region) return NextResponse.json({ data: buildVarRollup([], [], []) })
    query = query.eq('region', profile.region)
  } else if (level === 'own') {
    query = query.eq('id', profile.id)
  }

  // Optional narrowing on top of the caller's scope.
  const region = request.nextUrl.searchParams.get('region')
  if (region) query = query.eq('region', region)
  const repId = request.nextUrl.searchParams.get('rep_id')
  if (repId) query = query.eq('id', repId)

  const { data: reps, error: repsError } = await query
  if (repsError) return NextResponse.json({ error: 'Failed to load report' }, { status: 500 })

  const repList = reps ?? []
  if (repList.length === 0) {
    return NextResponse.json({ data: buildVarRollup([], [], []) })
  }

  // Two bounded hops: customers assigned to the scoped reps, then those
  // customers' orders — selecting only the columns the roll-up needs.
  const repIds = repList.map((r) => r.id)
  const { data: customers, error: customersError } = await svc
    .from('customers')
    .select('id, assigned_rep_id, region')
    .in('assigned_rep_id', repIds)
    .limit(MAX_CUSTOMERS)
  if (customersError) return NextResponse.json({ error: 'Failed to load report' }, { status: 500 })

  let orders: Array<{ customer_id: string | null; total_amount: number | null }> | null = null
  const customerIds = (customers ?? []).map((c) => c.id)
  if (customerIds.length > 0) {
    const { data, error } = await svc
      .from('orders')
      .select('customer_id, total_amount')
      .in('customer_id', customerIds)
      .limit(MAX_ORDERS)
    if (error) return NextResponse.json({ error: 'Failed to load report' }, { status: 500 })
    orders = data
  }

  return NextResponse.json({ data: buildVarRollup(repList, customers ?? [], orders ?? []) })
}