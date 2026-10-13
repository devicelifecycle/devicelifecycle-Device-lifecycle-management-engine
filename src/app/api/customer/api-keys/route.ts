// ============================================================================
// CUSTOMER API KEYS — list + create (customer-facing)
// ============================================================================
// Mirrors /api/var/api-keys but for org-admin customers. Gated by the
// api_access feature flag on the customer's tenant.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { featureGate } from '@/lib/supabase/require-feature'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(['read'])).min(1).default(['read']),
})

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!auth.profile.is_org_admin) {
    return NextResponse.json({ error: 'Only organization admins can manage API keys' }, { status: 403 })
  }
  const gated = await featureGate(auth.tenantId, 'api_access', 'API access')
  if (gated) return gated

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, tenant_id, name, key_prefix, scopes, created_at, last_used_at, revoked_at')
    .eq('tenant_id', auth.tenantId as string)
    .eq('user_id', auth.profile.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!auth.profile.is_org_admin) {
    return NextResponse.json({ error: 'Only organization admins can manage API keys' }, { status: 403 })
  }
  const gated = await featureGate(auth.tenantId, 'api_access', 'API access')
  if (gated) return gated

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const raw = `dlm_${randomBytes(24).toString('base64url')}`
  const keyPrefix = raw.slice(0, 12)
  const keyHash = createHash('sha256').update(raw).digest('hex')

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      tenant_id: auth.tenantId,
      user_id: auth.profile.id,
      name: parsed.data.name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: parsed.data.scopes,
    })
    .select('id, tenant_id, name, key_prefix, scopes, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
  return NextResponse.json({ data: { ...data, key: raw } }, { status: 201 })
}
