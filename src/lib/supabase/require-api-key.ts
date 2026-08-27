// ============================================================================
// API KEY AUTH — Bearer-token verification for programmatic (external) access
// ============================================================================
// Verifies a `Authorization: Bearer dlm_...` token by SHA-256 hashing it and
// looking up the (non-revoked) row. Returns the owning tenant + scopes. The app
// stores only the hash; the plaintext key is shown to the user exactly once.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from './service-role'
import { createHash } from 'crypto'

export interface ApiKeyContext {
  tenantId: string
  keyId: string
  scopes: string[]
}

export async function requireApiKey(
  req: NextRequest
): Promise<{ error: NextResponse } | { ctx: ApiKeyContext }> {
  const header = req.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const raw = match[1].trim()
  const hash = createHash('sha256').update(raw).digest('hex')

  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('api_keys')
    .select('id, tenant_id, scopes, revoked_at')
    .eq('key_hash', hash)
    .is('revoked_at', null)
    .maybeSingle()

  if (!data) {
    return { error: NextResponse.json({ error: 'Invalid API key' }, { status: 401 }) }
  }

  // Best-effort "last used" heartbeat (never blocks the request).
  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)

  return {
    ctx: {
      tenantId: data.tenant_id as string,
      keyId: data.id as string,
      scopes: (data.scopes as string[]) || [],
    },
  }
}
