// ============================================================================
// DELEGATED-ROLE DATA SCOPING (Appendix A hierarchy)
// ============================================================================
// Decides how much of a VAR's data a delegated role can see:
//   • VAR Entity Admin   → the whole tenant
//   • Regional Manager   → only their region
//   • Sales Rep          → only customers assigned to them
// Pure decision + a filter descriptor the data APIs apply. Any non-VAR role
// returns 'none' (the existing role rules apply unchanged), so this is inert
// until delegated VAR users exist.

import { PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'

export type DelegationLevel = 'tenant' | 'region' | 'own' | 'none'

export function delegationLevel(role: string | null | undefined): DelegationLevel {
  switch (role) {
    case 'var_entity_admin': return 'tenant'
    case 'var_regional_manager': return 'region'
    case 'var_sales_rep': return 'own'
    default: return 'none'
  }
}

export interface DelegationContext {
  role: string | null | undefined
  userId: string
  region: string | null
}

export interface ScopeFilter { column: string; value: string }

/**
 * The extra WHERE filter a delegated user's customer queries need, or null when
 * no extra filter applies (tenant-wide access, or a non-delegated role).
 * A regional manager with no region set is treated as 'own' so they can't
 * accidentally see the whole tenant.
 */
export function customerScopeFilter(ctx: DelegationContext): ScopeFilter | null {
  const level = delegationLevel(ctx.role)
  if (level === 'region') {
    return ctx.region ? { column: 'region', value: ctx.region } : { column: 'assigned_rep_id', value: ctx.userId }
  }
  if (level === 'own') return { column: 'assigned_rep_id', value: ctx.userId }
  return null // 'tenant' or 'none'
}

/**
 * Can this actor run a VAR management action (suspend / assign / move) on a
 * customer that lives in `customerRegion`?
 *   • platform admin        → yes, always
 *   • VAR Entity Admin       → yes for the whole tenant (RLS still bounds it)
 *   • VAR Regional Manager   → only customers in their own region
 *   • Sales Rep / anyone else → no (read/own-scope only)
 * Pure so it can be unit-tested and reused across management routes.
 */
export function canManageCustomer(
  role: string,
  effectiveRole: string,
  actorRegion: string | null,
  customerRegion: string | null,
): boolean {
  if (role === 'admin') return true
  const level = delegationLevel(effectiveRole)
  if (level === 'tenant') return true
  if (level === 'region') return actorRegion != null && actorRegion === customerRegion
  return false
}

/** Delegated VAR roles a caller is ever allowed to create through the team-management route. */
export type ManagedVarRole = 'var_regional_manager' | 'var_sales_rep'

/**
 * Can this actor create/disable/reset-password a delegated VAR team member of
 * `targetRole`, who would be assigned to `targetRegion`?
 *   • platform admin        → yes, any target role/region (whole platform)
 *   • VAR Entity Admin       → yes, either delegated role, anywhere in their tenant
 *                              (tenant boundary is enforced by RLS, not here)
 *   • VAR Regional Manager   → only var_sales_rep, and only within their OWN region
 *   • Sales Rep / anyone else → no — reps don't manage other reps
 * A platform admin is never restricted by `actorRegion`, mirroring
 * canManageCustomer's admin bypass. Pure so it's unit-testable in isolation.
 */
export function canManageVarTeamMember(
  role: string,
  effectiveRole: string,
  actorRegion: string | null,
  targetRole: ManagedVarRole,
  targetRegion: string | null,
): boolean {
  if (role === 'admin') return true
  const level = delegationLevel(effectiveRole)
  if (level === 'tenant') return true
  if (level === 'region') {
    return targetRole === 'var_sales_rep' && actorRegion != null && actorRegion === targetRegion
  }
  return false
}

/**
 * Which VAR tenant a request acts on. A VAR-role actor is always pinned to
 * their own tenant and can never override it. A platform admin has no tenant
 * of their own, so they must supply one explicitly (e.g. `?tenant_id=` or a
 * request body field) — returns null if they didn't, rather than silently
 * falling back to the platform tenant (which would misfile the action).
 */
export function resolveTargetTenant(
  isPlatformAdmin: boolean,
  actorTenantId: string | null,
  requestedTenantId: string | null,
): string | null {
  if (!isPlatformAdmin) return actorTenantId && actorTenantId !== PLATFORM_TENANT_ID ? actorTenantId : null
  return requestedTenantId
}
