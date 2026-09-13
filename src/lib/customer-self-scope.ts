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
 *
 * An organization can have more than one customers row (POST /api/customers
 * explicitly checks for this — `.eq('is_active', true).limit(1)` rather than
 * assuming uniqueness), so this can't use `.maybeSingle()`, which errors on
 * more than one match. Prefers the oldest active row, matching that route's
 * own reuse logic, falling back to the oldest row of any status.
 */
export async function resolveOwnCustomerId(auth: SelfScopeAuth): Promise<SelfScopeResult> {
  if (!auth.profile.organization_id) {
    return { ok: false, response: NextResponse.json({ error: 'No organization associated with this account' }, { status: 400 }) }
  }
  const supabase = createServiceRoleClient()
  const { data: customers } = await supabase
    .from('customers').select('id, is_active').eq('organization_id', auth.profile.organization_id)
    .order('created_at', { ascending: true })
  const customer = customers?.find((c) => c.is_active) ?? customers?.[0]
  if (!customer) {
    return { ok: false, response: NextResponse.json({ error: 'Customer profile not found' }, { status: 404 }) }
  }
  return { ok: true, customerId: customer.id }
}
