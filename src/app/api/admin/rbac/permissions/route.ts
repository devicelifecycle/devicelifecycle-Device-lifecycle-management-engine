// ============================================================================
// RBAC — permission catalog + role→permission map (admin)
// ============================================================================
// Returns the canonical permission catalog and the role→permission mapping used
// by requireAuth()/useCan() so the admin Roles UI can render a live matrix.

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { PERMISSION_KEYS, ROLE_PERMISSIONS } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requirePermission('tenant.view')
  if ('error' in guard) return guard.error

  return NextResponse.json({
    permissions: PERMISSION_KEYS,
    roles: ROLE_PERMISSIONS,
  })
}
