// ============================================================================
// VAR / ADMIN API KEYS — list + create
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(['read', 'write'])).min(1).default(['read', 'write']),
  tenant_id: z.string().uuid().optional(), // admin only
})

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!['admin', 'var_entity_admin'].includes(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('api_keys')
    .select('id, tenant_id, name, key_prefix, scopes, created_at, last_used_at, revoked_at')
  if (auth.effectiveRole !== 'admin') query = query.eq('tenant_id', auth.tenantId as string)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!['admin', 'var_entity_admin'].includes(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const tenantId = auth.effectiveRole === 'admin' ? parsed.data.tenant_id : auth.tenantId
  if (!tenantId) return NextResponse.json({ error: 'A tenant_id is required' }, { status: 400 })

  const raw = `dlm_${randomBytes(24).toString('base64url')}`
  const keyPrefix = raw.slice(0, 12)
  const keyHash = createHash('sha256').update(raw).digest('hex')

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      tenant_id: tenantId,
      user_id: auth.profile.id,
      name: parsed.data.name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: parsed.data.scopes,
    })
    .select('id, tenant_id, name, key_prefix, scopes, created_at')
    .single()
  if (error) return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })

  // Return the plaintext key exactly once.
  return NextResponse.json({ data: { ...data, key: raw } }, { status: 201 })
}