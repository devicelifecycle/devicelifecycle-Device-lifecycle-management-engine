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

  // Member counts per role (one grouped query; small result set).
  const { data: links } = await supabase.from('user_roles').select('role_id')
  const counts = new Map<string, number>()
  for (const l of links ?? []) counts.set(l.role_id as string, (counts.get(l.role_id as string) ?? 0) + 1)

  const data = (roles ?? []).map((r) => ({
    id: r.id, key: r.key, name: r.name, description: r.description,
    is_system: r.is_system, tenant_id: r.tenant_id,
    tenant_name: (r.tenants as { name?: string } | null)?.name ?? null,
    members: counts.get(r.id as string) ?? 0,
  }))
  return NextResponse.json({ data })
}
