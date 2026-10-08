// ============================================================================
// CUSTOMER API KEYS — list / create / revoke (scoped to customer's tenant)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { generateApiKey } from '@/lib/api-keys'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(2).max(100),
  scopes: z.array(z.enum(['read', 'write'])).min(1).default(['read']),
})

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!auth.tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 })

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, scopes, created_at, last_used_at, revoked_at')
    .eq('tenant_id', auth.tenantId)
    .eq('created_by', auth.profile.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!auth.tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 })

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const key = generateApiKey()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('api_keys').insert({
    tenant_id: auth.tenantId,
    name: parsed.data.name,
    key_prefix: key.prefix,
    key_hash: key.hash,
    scopes: parsed.data.scopes,
    created_by: auth.profile.id,
  }).select('id, name, key_prefix, scopes, created_at').single()

  if (error) {
    console.error('Failed to create customer API key:', error)
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
  }

  return NextResponse.json({ data: { ...data, key: key.plaintext } }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  const body = await request.json().catch(() => null)
  const id = body?.id
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing key id' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('created_by', auth.profile.id)

  if (error) return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
