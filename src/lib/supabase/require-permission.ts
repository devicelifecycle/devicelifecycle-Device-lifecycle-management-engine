// ============================================================================
// PERMISSION GUARD — for Route Handlers (fine-grained RBAC)
// ============================================================================
// Wraps requireAuth() and enforces a specific permission against the user's
// currently-active role (effectiveRole). Use to gate individual capabilities
// beyond the coarse role checks. Returns { error } or { auth }.

import { NextResponse } from 'next/server'
import { requireAuth } from './require-auth'
import { hasPermission, type PermissionKey } from '@/lib/permissions'

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
