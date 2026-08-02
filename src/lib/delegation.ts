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
