// ============================================================================
// RBAC — permission catalog + role→permission mapping (Phase 2)
// ============================================================================
// Code-side mirror of the DB seed in 20260731000000_rbac_foundation.sql. This
// lets the app check permissions (hasPermission) without changing the existing
// role guards — it's additive. As delegated/hierarchical VAR roles come online,
// the source of truth shifts to the DB (roles/role_permissions) and this static
// map becomes the fallback for the six system roles.
// ============================================================================

export const PERMISSION_KEYS = [
  'platform.manage', 'tenant.manage', 'tenant.view',
  'user.create', 'user.update', 'user.delete', 'user.view',
  'customer.create', 'customer.update', 'customer.delete', 'customer.view',
  'vendor.manage', 'vendor.view',
  'order.create', 'order.update', 'order.transition', 'order.view',
  'pricing.manage', 'pricing.view',
  'commission.manage', 'commission.view',
  'billing.manage', 'billing.view',
  'reports.view', 'audit.view',
  'impersonate.tenant', 'feature.manage', 'licensing.manage',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  admin: [...PERMISSION_KEYS],
  coe_manager: [
    'tenant.view', 'user.view',
    'customer.create', 'customer.update', 'customer.delete', 'customer.view',
    'vendor.manage', 'vendor.view',
    'order.create', 'order.update', 'order.transition', 'order.view',
    'pricing.view', 'commission.view', 'billing.view', 'reports.view', 'audit.view',
  ],
  coe_tech: ['order.view', 'order.transition', 'customer.view', 'vendor.view', 'reports.view'],
  sales: ['order.create', 'order.view', 'customer.create', 'customer.view', 'pricing.view', 'reports.view'],
  customer: ['order.create', 'order.view', 'reports.view'],
  vendor: ['order.view', 'reports.view'],
}

/** Does this role grant the given permission? */
export function hasPermission(role: string | null | undefined, permission: PermissionKey): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

/** All permission keys granted to a role. */
export function permissionsForRole(role: string | null | undefined): PermissionKey[] {
  if (!role) return []
  return ROLE_PERMISSIONS[role] ?? []
}
