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
import { featureGate } from '@/lib/supabase/require-feature'
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
// Ids per .in() batch — keeps the generated query string well inside limits.
const ID_CHUNK = 300

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const { profile, effectiveRole, tenantId } = auth

  if (!VAR_CONSOLE_ROLES.has(effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const gated = await featureGate(tenantId, 'reporting', 'Reporting')
  if (gated) return gated

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

  // Customers in scope with NO rep assigned. These can't appear in the
  // assigned-rep fetch below (it filters on assigned_rep_id), so without this
  // second query unassignedCustomerCount would be structurally always 0 and
  // the "unassigned customers" callout could never fire. A sales rep only ever
  // sees their own customers, so unassigned ones aren't theirs to see.
  let unassigned: Array<{ id: string; assigned_rep_id: string | null; region: string | null }> = []
  if (level !== 'own') {
    let unassignedQuery = svc
      .from('customers')
      .select('id, assigned_rep_id, region')
      .eq('tenant_id', scopeTenantId)
      .is('assigned_rep_id', null)
      .limit(MAX_CUSTOMERS)
    // A regional manager's view is their region, so only count unassigned
    // customers sitting in it; an explicit ?region= narrows the same way.
    const effectiveRegion = level === 'region' ? profile.region : region
    if (effectiveRegion) unassignedQuery = unassignedQuery.eq('region', effectiveRegion)
    const { data: unassignedRows, error: unassignedError } = await unassignedQuery
    if (unassignedError) return NextResponse.json({ error: 'Failed to load report' }, { status: 500 })
    unassigned = unassignedRows ?? []
  }

  if (repList.length === 0) {
    return NextResponse.json({ data: buildVarRollup([], unassigned, []) })
  }

  // Two bounded hops: customers assigned to the scoped reps, then those
  // customers' orders — selecting only the columns the roll-up needs.
  const repIds = repList.map((r) => r.id)
  const { data: assignedCustomers, error: customersError } = await svc
    .from('customers')
    .select('id, assigned_rep_id, region')
    .in('assigned_rep_id', repIds)
    .limit(MAX_CUSTOMERS)
  if (customersError) return NextResponse.json({ error: 'Failed to load report' }, { status: 500 })

  const customers = [...(assignedCustomers ?? []), ...unassigned]

  // Orders are only fetched for rep-assigned customers: the roll-up attributes
  // orders through a rep, so an unassigned customer's orders would be loaded
  // and then ignored, spending the bounded order budget on unusable rows.
  //
  // Fetched in chunks: a single .in() with thousands of UUIDs builds a query
  // string large enough to be rejected outright, which would fail the whole
  // report rather than degrade it.
  const orders: Array<{ customer_id: string | null; total_amount: number | null }> = []
  const customerIds = (assignedCustomers ?? []).map((c) => c.id)
  let ordersTruncated = false
  for (let i = 0; i < customerIds.length; i += ID_CHUNK) {
    if (orders.length >= MAX_ORDERS) { ordersTruncated = true; break }
    const chunk = customerIds.slice(i, i + ID_CHUNK)
    const { data, error } = await svc
      .from('orders')
      .select('customer_id, total_amount')
      .in('customer_id', chunk)
      .limit(MAX_ORDERS - orders.length)
    if (error) return NextResponse.json({ error: 'Failed to load report' }, { status: 500 })
    orders.push(...(data ?? []))
  }
  if (orders.length >= MAX_ORDERS) ordersTruncated = true

  return NextResponse.json({
    data: buildVarRollup(repList, customers, orders),
    // Surfaced so the UI can say the numbers are partial rather than showing a
    // quietly wrong total as if it were complete.
    truncated: {
      customers: (assignedCustomers ?? []).length >= MAX_CUSTOMERS || unassigned.length >= MAX_CUSTOMERS,
      orders: ordersTruncated,
    },
  })
}