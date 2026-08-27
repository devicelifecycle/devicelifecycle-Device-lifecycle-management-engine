'use client'

import { useAuth } from '@/hooks/useAuth'
import { hasPermission, type PermissionKey } from '@/lib/permissions'

/**
 * Client-side permission check hook. Evaluates the current user's effective
 * role (and secondary role, if any) against the static RBAC map. Pair with the
 * server-side `requirePermission` guard for true enforcement — this is for
 * showing/hiding UI only.
 */
export function useCan() {
  const { activeRole, user } = useAuth()
  const role = activeRole ?? user?.role ?? null
  const secondary = user?.secondary_role ?? null

  const can = (permission: PermissionKey): boolean => {
    if (hasPermission(role, permission)) return true
    if (secondary && hasPermission(secondary, permission)) return true
    return false
  }

  return { can, role, secondary }
}