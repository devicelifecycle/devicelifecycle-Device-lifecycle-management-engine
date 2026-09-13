// ============================================================================
// CUSTOMER SELF-SCOPE — pins a 'customer'-role caller to their own customer row
// ============================================================================
// Several /api/customer/* and /api/reminders /api/tickets routes previously
// scoped only by tenant_id, which does nothing to separate customers within
// the same tenant (every pre-VAR customer shares the platform tenant_id) —
// any authenticated 'customer' could read/write any other customer's assets,
// company profile, reminders, or tickets. This resolves the caller's own
// customers.id from their organization_id so routes can force every query to
// it instead of trusting a client-supplied customer_id.

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface SelfScopeAuth {
  effectiveRole: string
  profile: { organization_id: string | null }
}

export type SelfScopeResult =
  | { ok: true; customerId: string }
  | { ok: false; response: NextResponse }

/**
 * Resolves the caller's own customers.id when effectiveRole === 'customer'.
 * Callers must force every query's customer_id to this value — never trust a
 * client-supplied customer_id for this role.
 */
export async function resolveOwnCustomerId(auth: SelfScopeAuth): Promise<SelfScopeResult> {
  if (!auth.profile.organization_id) {
    return { ok: false, response: NextResponse.json({ error: 'No organization associated with this account' }, { status: 400 }) }
  }
  const supabase = createServiceRoleClient()
  const { data: customer } = await supabase
    .from('customers').select('id').eq('organization_id', auth.profile.organization_id).maybeSingle()
  if (!customer) {
    return { ok: false, response: NextResponse.json({ error: 'Customer profile not found' }, { status: 404 }) }
  }
  return { ok: true, customerId: customer.id }
}
