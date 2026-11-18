// ============================================================================
// BILLABLE SEATS — who a per-seat plan charges for
// ============================================================================
// A seat is an active STAFF login on the tenant: the VAR's entity admins,
// regional managers and sales reps (and any internal staff roles). The VAR's
// own end customers and vendors also log in under the tenant, but they are the
// VAR's clients, not its seats. Counting them billed a VAR more the more
// customers it onboarded to the portal.
//
// One definition for every charge path: recurring charge, dunning retry, plan
// change proration and the platform MRR report.

import type { createServiceRoleClient } from '@/lib/supabase/service-role'

type Svc = ReturnType<typeof createServiceRoleClient>

/** Roles that are never billed as seats. */
export const NON_SEAT_ROLES = ['customer', 'vendor'] as const

/** Active billable seats on one tenant (at least 1, the plan minimum). */
export async function countBillableSeats(supabase: Svc, tenantId: string): Promise<number> {
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .not('role', 'in', `(${NON_SEAT_ROLES.join(',')})`)
  if (error) throw new Error(`seats: count failed: ${error.message}`)
  return Math.max(1, count ?? 0)
}

/**
 * Billable seats for many tenants in one bounded pass (platform MRR). Pages
 * through the users table rather than issuing one COUNT per tenant.
 */
export async function countBillableSeatsByTenant(supabase: Svc, tenantIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>(tenantIds.map((id) => [id, 0]))
  if (tenantIds.length === 0) return out
  const PAGE = 1000
  for (let i = 0; i < tenantIds.length; i += 200) {
    const chunk = tenantIds.slice(i, i + 200)
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('users')
        .select('tenant_id')
        .in('tenant_id', chunk)
        .eq('is_active', true)
        .not('role', 'in', `(${NON_SEAT_ROLES.join(',')})`)
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`seats: bulk count failed: ${error.message}`)
      for (const r of data ?? []) out.set(r.tenant_id as string, (out.get(r.tenant_id as string) ?? 0) + 1)
      if (!data || data.length < PAGE) break
    }
  }
  for (const [k, v] of out) out.set(k, Math.max(1, v))
  return out
}
