// POST /api/oauth/revoke — RFC 7009. Revoking either token of a grant ends
// the whole grant. Always 200 (the spec forbids leaking whether it existed).
import { NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sha256, revokeFamily } from '@/lib/oauth/oauth'
import { oauthJson, preflight, readParams } from '@/lib/oauth/http'

export const dynamic = 'force-dynamic'

export function OPTIONS() { return preflight() }

export async function POST(req: NextRequest) {
  const p = await readParams(req)
  if (p.token) {
    const supabase = createServiceRoleClient()
    const { data } = await supabase.from('oauth_tokens').select('family_id, client_id')
      .eq('token_hash', sha256(p.token)).maybeSingle()
    if (data && (!p.client_id || p.client_id === data.client_id)) await revokeFamily(supabase, data.family_id as string)
  }
  return oauthJson({})
}
