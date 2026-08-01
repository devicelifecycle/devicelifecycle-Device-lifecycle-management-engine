// ============================================================================
// ADMIN USER-ROLES API — assign / unassign a delegated role to a user
// ============================================================================
// Assigns a user to a role via user_roles. The role must belong to the same
// tenant as the user (or be a platform system role), so a VAR role can't be
// attached to a user in another tenant.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const PLATFORM_TENANT_ID = 'a0000000-0000-4000-a000-0000000000bb'

const bodySchema = z.object({
  email: z.string().email(),
  role_key: z.string().min(2).max(60),
})

async function adminOnly() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() as NextResponse }
  if (auth.effectiveRole !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { auth }
}

async function resolve(body: unknown) {
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return { error: NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 }) }
  const supabase = createServiceRoleClient()

  const { data: user } = await supabase.from('users').select('id, tenant_id').eq('email', parsed.data.email.toLowerCase()).maybeSingle()
  if (!user) return { error: NextResponse.json({ error: 'No user with that email' }, { status: 404 }) }

  const tenantId = user.tenant_id ?? PLATFORM_TENANT_ID
  // Role must be in the user's tenant, or a platform system role.
  const { data: role } = await supabase
    .from('roles').select('id, tenant_id')
    .eq('key', parsed.data.role_key)
    .in('tenant_id', [tenantId, PLATFORM_TENANT_ID])
    .maybeSingle()
  if (!role) return { error: NextResponse.json({ error: 'Role not available for that user' }, { status: 404 }) }

  return { supabase, userId: user.id as string, roleId: role.id as string }
}

export async function POST(request: NextRequest) {
  const g = await adminOnly()
  if (g.error) return g.error
  const r = await resolve(await request.json().catch(() => null))
  if (r.error) return r.error

  const { error } = await r.supabase.from('user_roles').upsert({ user_id: r.userId, role_id: r.roleId }, { onConflict: 'user_id,role_id' })
  if (error) {
    console.error('Failed to assign role:', error)
    return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const g = await adminOnly()
  if (g.error) return g.error
  const r = await resolve(await request.json().catch(() => null))
  if (r.error) return r.error

  const { error } = await r.supabase.from('user_roles').delete().eq('user_id', r.userId).eq('role_id', r.roleId)
  if (error) return NextResponse.json({ error: 'Failed to unassign role' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
