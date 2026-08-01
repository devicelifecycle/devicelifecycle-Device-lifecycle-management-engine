// ============================================================================
// ADMIN ROLES API — list roles (system + delegated) with member counts
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceRoleClient()
  const { data: roles, error } = await supabase
    .from('roles')
    .select('id, key, name, description, is_system, tenant_id, tenants(name)')
    .order('is_system', { ascending: false })
    .order('key', { ascending: true })
  if (error) return NextResponse.json({ error: 'Failed to load roles' }, { status: 500 })

  // Per-role member counts via bounded COUNT(head) queries (roles are few) —
  // never load the whole user_roles table into memory, which can be huge.
  const counts = await Promise.all(
    (roles ?? []).map((r) =>
      supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role_id', r.id)
        .then((res) => res.count ?? 0),
    ),
  )

  const data = (roles ?? []).map((r, i) => ({
    id: r.id, key: r.key, name: r.name, description: r.description,
    is_system: r.is_system, tenant_id: r.tenant_id,
    tenant_name: (r.tenants as { name?: string } | null)?.name ?? null,
    members: counts[i],
  }))
  return NextResponse.json({ data })
}
