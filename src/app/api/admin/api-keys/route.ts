// ============================================================================
// ADMIN API KEYS — list / create / revoke
// ============================================================================
// Never returns the key hash. The plaintext secret is returned exactly once, on
// creation, and cannot be retrieved again.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { generateApiKey } from '@/lib/api-keys'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(2).max(100),
  tenant_id: z.string().uuid().optional(),
})
const revokeSchema = z.object({ id: z.string().uuid() })

async function adminOnly() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() as NextResponse }
  if (auth.effectiveRole !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { auth }
}

const PLATFORM_TENANT_ID = 'a0000000-0000-4000-a000-0000000000bb'

export async function GET() {
  const g = await adminOnly()
  if (g.error) return g.error
  const supabase = createServiceRoleClient()
  // Note: key_hash is deliberately never selected.
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, tenant_id, name, key_prefix, last_used_at, created_at, revoked_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const g = await adminOnly()
  if (g.error) return g.error
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })

  const key = generateApiKey()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('api_keys').insert({
    tenant_id: parsed.data.tenant_id ?? g.auth.tenantId ?? PLATFORM_TENANT_ID,
    name: parsed.data.name,
    key_prefix: key.prefix,
    key_hash: key.hash,
    created_by: g.auth.profile.id,
  }).select('id, name, key_prefix, created_at').single()
  if (error) {
    console.error('Failed to create API key:', error)
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
  }
  // Return the secret ONCE — it is not stored and cannot be shown again.
  return NextResponse.json({ data: { ...data, key: key.plaintext } }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const g = await adminOnly()
  if (g.error) return g.error
  const parsed = revokeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })

  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', parsed.data.id)
  if (error) return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
