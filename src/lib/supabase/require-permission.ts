// ============================================================================
// PERMISSION GUARD — for Route Handlers (fine-grained RBAC)
// ============================================================================
// Wraps requireAuth() and enforces a specific permission against the user's
// currently-active role (effectiveRole). Use to gate individual capabilities
// beyond the coarse role checks. Returns { error } or { auth }.

import { NextResponse } from 'next/server'
import { requireAuth } from './require-auth'
import { hasPermission, type PermissionKey } from '@/lib/permissions'
import { delegationLevel } from '@/lib/delegation'

export type PermissionGuard =
  | { error: NextResponse }
  | { auth: NonNullable<Awaited<ReturnType<typeof requireAuth>>> }

export async function requirePermission(permission: PermissionKey): Promise<PermissionGuard> {
  const auth = await requireAuth()
  if (!auth) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  // Only the currently-active role grants permissions — a user switched into
  // a lower-privilege role must not still pass on the other role's grant.
  if (!hasPermission(auth.effectiveRole, permission)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { auth }
}

/**
 * requirePermission for platform-wide data (every tenant's invoices, BB revenue,
 * platform KPIs). VAR roles share permission keys like reports.view/billing.view
 * for their OWN data, served by /api/var/*; those keys must not unlock data
 * that spans all tenants.
 */
export async function requirePlatformPermission(permission: PermissionKey): Promise<PermissionGuard> {
  const guard = await requirePermission(permission)
  if ('error' in guard) return guard
  if (delegationLevel(guard.auth.effectiveRole) !== 'none') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return guard
}
