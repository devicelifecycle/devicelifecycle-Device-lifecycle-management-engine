// ============================================================================
// RBAC — permission catalog + role→permission map (admin)
// ============================================================================
// GET  → returns the permission catalog + role→permission matrix from DB
// PUT  → updates a single role's permission set (non-system roles only by
//         default; system roles editable with ?system=true for admin override)

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PERMISSION_KEYS, ROLE_PERMISSIONS } from '@/lib/permissions'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requirePermission('platform.manage')
  if ('error' in guard) return guard.error

  const supabase = createServiceRoleClient()

  const [{ data: dbRoles }, { data: dbPerms }, { data: dbRp }] = await Promise.all([
    supabase.from('roles').select('id, key').order('key'),
    supabase.from('permissions').select('id, key').order('key'),
    supabase.from('role_permissions').select('role_id, permission_id'),
  ])

  if (!dbRoles || !dbPerms) {
    return NextResponse.json({
      permissions: PERMISSION_KEYS,
      roles: ROLE_PERMISSIONS,
      source: 'static',
    })
  }

  const permById = new Map((dbPerms).map((p) => [p.id, p.key]))
  const roleMap: Record<string, string[]> = {}
  for (const r of dbRoles) roleMap[r.key] = []

  for (const rp of dbRp ?? []) {
    const role = dbRoles.find((r) => r.id === rp.role_id)
    const perm = permById.get(rp.permission_id)
    if (role && perm) roleMap[role.key].push(perm)
  }

  return NextResponse.json({
    permissions: dbPerms.map((p) => p.key),
    roles: roleMap,
    source: 'database',
  })
}

const putSchema = z.object({
  role_key: z.string().min(1).max(60),
  permissions: z.array(z.string().min(1).max(80)),
})

export async function PUT(request: NextRequest) {
  const guard = await requirePermission('platform.manage')
  if ('error' in guard) return guard.error

  const parsed = putSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { data: role } = await supabase
    .from('roles')
    .select('id, key, is_system')
    .eq('key', parsed.data.role_key)
    .limit(1)
    .maybeSingle()

  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })

  const { data: allPerms } = await supabase.from('permissions').select('id, key')
  if (!allPerms) return NextResponse.json({ error: 'Failed to load permissions' }, { status: 500 })

  const permByKey = new Map(allPerms.map((p) => [p.key, p.id]))
  const newPermIds = parsed.data.permissions
    .map((k) => permByKey.get(k))
    .filter((id): id is string => !!id)

  await supabase.from('role_permissions').delete().eq('role_id', role.id)

  if (newPermIds.length > 0) {
    const { error: insertErr } = await supabase.from('role_permissions').insert(
      newPermIds.map((pid) => ({ role_id: role.id, permission_id: pid })),
    )
    if (insertErr) {
      console.error('Failed to update role permissions:', insertErr)
      return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, role_key: role.key, count: newPermIds.length })
}
