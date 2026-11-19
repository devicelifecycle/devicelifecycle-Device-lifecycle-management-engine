// ============================================================================
// POST /api/oauth/token — authorization_code (+PKCE) and refresh_token grants
// ============================================================================

import { NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkRateLimitAsync, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { exchangeCode, refreshTokens } from '@/lib/oauth/oauth'
import { oauthJson, oauthError, preflight, readParams } from '@/lib/oauth/http'

export const dynamic = 'force-dynamic'

export function OPTIONS() { return preflight() }

export async function POST(req: NextRequest) {
  const rl = await checkRateLimitAsync(`oauth-token:${getClientIp(req)}`, RATE_LIMITS.api)
  if (!rl.allowed) return oauthError('slow_down', 'Too many token requests.', 429)

  const p = await readParams(req)
  const clientId = p.client_id
  if (!clientId) return oauthError('invalid_client', 'client_id is required.', 401)
  const supabase = createServiceRoleClient()
  const { data: client } = await supabase.from('oauth_clients').select('id').eq('id', clientId).maybeSingle()
  if (!client) return oauthError('invalid_client', 'Unknown client.', 401)

  if (p.grant_type === 'authorization_code') {
    if (!p.code || !p.code_verifier || !p.redirect_uri) {
      return oauthError('invalid_request', 'code, code_verifier and redirect_uri are required.')
    }
    const r = await exchangeCode(supabase, { code: p.code, verifier: p.code_verifier, clientId, redirectUri: p.redirect_uri })
    return 'error' in r ? oauthError(r.error, r.error_description) : oauthJson(r)
  }
  if (p.grant_type === 'refresh_token') {
    if (!p.refresh_token) return oauthError('invalid_request', 'refresh_token is required.')
    const r = await refreshTokens(supabase, { refreshToken: p.refresh_token, clientId })
    return 'error' in r ? oauthError(r.error, r.error_description) : oauthJson(r)
  }
  return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.')
}
