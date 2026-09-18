// GET /api/v1/me — identify the calling key. The smoke test every integrator
// runs first: "is my key valid, what tenant is it for, what can it do?"
// Scope-less on purpose: a write-only key still needs to learn who it is.
import { NextRequest } from 'next/server'
import { authorizeV1, itemResponse, API_VERSION } from '@/lib/public-api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await authorizeV1(req, null)
  if ('error' in auth) return auth.error
  const { ctx } = auth

  const { data: tenant } = await ctx.supabase
    .from('tenants').select('id, name, slug').eq('id', ctx.tenantId).maybeSingle()

  return itemResponse({
    api_version: API_VERSION,
    key_id: ctx.key.keyId,
    scopes: ctx.key.scopes,
    tenant: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : { id: ctx.tenantId },
  })
}
