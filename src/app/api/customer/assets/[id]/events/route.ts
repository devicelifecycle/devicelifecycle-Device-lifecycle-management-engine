// ============================================================================
// CUSTOMER ASSET EVENTS API — audit trail for one asset (tenant-scoped)
// ============================================================================
// Read side of the customer-asset audit trail (customer_asset_events, migration
// 20260823000000). Scoping mirrors GET/PATCH /api/customer/assets: service-role
// reads with non-admin callers pinned to their own tenant, so an asset outside
// their tenant answers 404 rather than leaking its existence.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'

// Non-admins are restricted to their own tenant (service role bypasses RLS).
function tenantScoped(auth: { effectiveRole: string; tenantId: string | null }): string | null {
  return auth.effectiveRole !== 'admin' ? auth.tenantId : null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const { id } = await params
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid asset ID format' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Verify the asset exists within the caller's scope before reading history —
  // same shape as the PATCH handler's scope-checked lookup in the parent route.
  let assetQuery = supabase.from('customer_assets').select('id').eq('id', id)
  const onlyTenant = tenantScoped(auth)
  if (onlyTenant) assetQuery = assetQuery.eq('tenant_id', onlyTenant)
  const { data: asset } = await assetQuery.maybeSingle()
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: events, error } = await supabase.from('customer_asset_events')
    .select('id, event_type, details, actor_id, created_at')
    .eq('asset_id', id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: 'Failed to load history' }, { status: 500 })
  return NextResponse.json({ events })
}