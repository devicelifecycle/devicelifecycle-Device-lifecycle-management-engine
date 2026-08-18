// ============================================================================
// ORDER FILE ACCESS — tenant + org isolation guard
// ============================================================================
// Who may read/attach an order's raw device-list file. The order-file route
// uses the service-role client (RLS bypassed), so tenant + org isolation MUST
// be enforced here or a caller could reach another tenant's/org's order by id
// (IDOR). Lives outside the route file because a Next.js route.ts may only
// export HTTP-method handlers and a small reserved set of config fields —
// any other export fails the framework's route-type validation at build time.

import { PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'

export function canAccessOrderFile(
  order: { tenant_id?: string | null; customers?: unknown },
  profile: { organization_id: string | null; role: string },
  effectiveRole: string,
  actorTenant: string | null,
): boolean {
  // Tenant isolation: a tenant-scoped actor can only touch orders in their tenant.
  if (actorTenant && actorTenant !== PLATFORM_TENANT_ID) {
    if ((order.tenant_id ?? PLATFORM_TENANT_ID) !== actorTenant) return false
  }
  // Intra-tenant org scoping for the owning customer and org-bound COE techs.
  const needsOrgMatch = effectiveRole === 'customer' || (profile.role === 'coe_tech' && !!profile.organization_id)
  if (needsOrgMatch) {
    const orderOrg = (order.customers as { organization_id?: string } | null)?.organization_id
    if (!orderOrg || orderOrg !== profile.organization_id) return false
  }
  return true
}
