// ============================================================================
// VAR PLAN CATALOG — plans a VAR may assign to its own customers
// ============================================================================
// subscription_plans is a global platform catalog (no tenant column), so there
// is nothing to scope by tenant — this exists because GET /api/admin/plans is
// admin-only and the customer-management console needs names for its
// assign-plan picker. Active plans only, alphabetical for the dropdown.

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
export const dynamic = 'force-dynamic'

const PLAN_READERS = new Set(['admin', 'var_entity_admin'])

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  if (!PLAN_READERS.has(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })

  return NextResponse.json({ data: data ?? [] })
}