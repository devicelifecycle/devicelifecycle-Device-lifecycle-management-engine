// ============================================================================
// POST /api/oauth/register — Dynamic Client Registration (RFC 7591)
// ============================================================================
// MCP clients register themselves before the first sign-in. Public clients
// only: no secret is issued; every authorization needs PKCE. Registration
// grants nothing by itself — a person must still sign in and approve.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkRateLimitAsync, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { isAllowedRedirectUri } from '@/lib/oauth/oauth'
import { oauthJson, oauthError, preflight } from '@/lib/oauth/http'

export const dynamic = 'force-dynamic'

const schema = z.object({
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z.array(z.string().max(500)).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
}).passthrough()

export function OPTIONS() { return preflight() }

export async function POST(req: NextRequest) {
  // Not the strict login limit: hosted assistants (e.g. Claude.ai) register
  // from a shared pool of provider IPs, so every DLM user connecting through
  // one would share this bucket. Registration grants nothing on its own.
  const rl = await checkRateLimitAsync(`oauth-register:${getClientIp(req)}`, RATE_LIMITS.api)
  if (!rl.allowed) return oauthError('slow_down', 'Too many registrations. Try again shortly.', 429)

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return oauthError('invalid_client_metadata', 'redirect_uris is required.')
  const d = parsed.data
  const bad = d.redirect_uris.find((u) => !isAllowedRedirectUri(u))
  if (bad) return oauthError('invalid_redirect_uri', `Redirect URI not allowed: ${bad}. Use https, or http on localhost.`)
  if (d.token_endpoint_auth_method && d.token_endpoint_auth_method !== 'none') {
    return oauthError('invalid_client_metadata', 'Only public clients (token_endpoint_auth_method "none") are supported.')
  }
  if (d.grant_types?.some((g) => !['authorization_code', 'refresh_token'].includes(g))) {
    return oauthError('invalid_client_metadata', 'Supported grant types: authorization_code, refresh_token.')
  }

  const clientId = `dlmc_${randomUUID()}`
  const name = d.client_name ?? 'AI assistant'
  const { error } = await createServiceRoleClient().from('oauth_clients')
    .insert({ id: clientId, client_name: name, redirect_uris: d.redirect_uris })
  if (error) {
    console.error('oauth register failed', error)
    return oauthError('server_error', 'Could not register the client.', 500)
  }
  return oauthJson({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: d.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }, 201)
}
