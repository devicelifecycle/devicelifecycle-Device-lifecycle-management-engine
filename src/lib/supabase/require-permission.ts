// ============================================================================
// PERMISSION GUARD — for Route Handlers (fine-grained RBAC)
// ============================================================================
// Wraps requireAuth() and enforces a specific permission against the user's
// role (and secondary role). Use to gate individual capabilities beyond the
// coarse role checks. Returns { error } or { auth }.

import { NextResponse } from 'next/server'
import { requireAuth } from './require-auth'
import { hasPermission, type PermissionKey } from '@/lib/permissions'

export type PermissionGuard =
  | { error: NextResponse }
  | { auth: NonNullable<Awaited<ReturnType<typeof requireAuth>>> }

export async function requirePermission(permission: PermissionKey): Promise<PermissionGuard> {
  const auth = await requireAuth()
  if (!auth) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const roles = [auth.profile.role, auth.profile.secondary_role].filter(Boolean) as string[]
  const allowed = roles.some((r) => hasPermission(r, permission))
  if (!allowed) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  return { auth }
}
