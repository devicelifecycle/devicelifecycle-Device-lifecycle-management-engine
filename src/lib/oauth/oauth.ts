// ============================================================================
// OAUTH 2.1 (authorization code + PKCE) for the DLM MCP connector
// ============================================================================
// Public clients only (PKCE S256, no client secret), Dynamic Client
// Registration, single-use 60 s codes, 1 h opaque access tokens and 30 d
// rotating refresh tokens. A refresh token presented twice is treated as
// stolen: the whole grant (token family) is revoked. Every code and token is
// stored only as a SHA-256 hash.

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'

type Svc = ReturnType<typeof createServiceRoleClient>

export const OAUTH_SCOPES = ['dlm:read', 'dlm:write'] as const
export type OAuthScope = (typeof OAUTH_SCOPES)[number]
export const ACCESS_TTL_S = 3600
export const REFRESH_TTL_S = 30 * 86_400
export const CODE_TTL_S = 60
export const ACCESS_PREFIX = 'dlmo_'
export const REFRESH_PREFIX = 'dlmr_'

/** Roles that may connect an assistant (Phase 2): the VAR's own staff. */
export const OAUTH_ROLES = ['var_entity_admin', 'var_regional_manager', 'var_sales_rep'] as const

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const b64url = (b: Buffer) => b.toString('base64url')
export const randomToken = (prefix = '') => prefix + b64url(randomBytes(32))

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) === challenge, constant time. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false
  const a = Buffer.from(b64url(createHash('sha256').update(verifier).digest()))
  const b = Buffer.from(challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Redirect URIs a client may register: https anywhere, or http on the
 * loopback interface (desktop clients). No fragments, no credentials.
 */
export function isAllowedRedirectUri(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.hash || u.username || u.password) return false
  if (u.protocol === 'https:') return true
  return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
}

/** Parse a space-separated scope string into known scopes (read always implied). */
export function parseScopes(raw: string | null | undefined): OAuthScope[] {
  const asked = new Set((raw ?? '').split(/\s+/).filter(Boolean))
  const out: OAuthScope[] = ['dlm:read']
  if (asked.has('dlm:write')) out.push('dlm:write')
  return out
}

export interface TokenSet {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

async function issueTokens(supabase: Svc, a: { clientId: string; userId: string; tenantId: string | null; scopes: string[]; familyId?: string }): Promise<TokenSet> {
  const familyId = a.familyId ?? randomUUID()
  const access = randomToken(ACCESS_PREFIX)
  const refresh = randomToken(REFRESH_PREFIX)
  const now = Date.now()
  const base = { family_id: familyId, client_id: a.clientId, user_id: a.userId, tenant_id: a.tenantId, scopes: a.scopes }
  const { error } = await supabase.from('oauth_tokens').insert([
    { ...base, token_hash: sha256(access), kind: 'access', expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString() },
    { ...base, token_hash: sha256(refresh), kind: 'refresh', expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString() },
  ])
  if (error) throw new Error(`oauth: token insert failed: ${error.message}`)
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: a.scopes.join(' ') }
}

export async function issueCode(supabase: Svc, a: {
  clientId: string; userId: string; redirectUri: string; codeChallenge: string; scopes: string[]; resource: string | null
}): Promise<string> {
  const code = randomToken()
  const { error } = await supabase.from('oauth_codes').insert({
    code_hash: sha256(code), client_id: a.clientId, user_id: a.userId, redirect_uri: a.redirectUri,
    code_challenge: a.codeChallenge, scopes: a.scopes, resource: a.resource,
    expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  })
  if (error) throw new Error(`oauth: code insert failed: ${error.message}`)
  return code
}

export type OAuthError = { error: 'invalid_grant' | 'invalid_request' | 'invalid_client' | 'access_denied'; error_description: string }

/** Is this user (still) allowed to hold a DLM MCP grant? */
export async function eligibleUser(supabase: Svc, userId: string): Promise<{ tenantId: string | null } | null> {
  const { data } = await supabase.from('users').select('role, tenant_id, is_active').eq('id', userId).maybeSingle()
  if (!data || data.is_active === false || !(OAUTH_ROLES as readonly string[]).includes(data.role as string)) return null
  return { tenantId: (data.tenant_id as string | null) ?? null }
}

export async function exchangeCode(supabase: Svc, a: { code: string; verifier: string; clientId: string; redirectUri: string }): Promise<TokenSet | OAuthError> {
  // Single use: claim the code atomically before anything else.
  const { data: claimed } = await supabase.from('oauth_codes').update({ used_at: new Date().toISOString() })
    .eq('code_hash', sha256(a.code)).is('used_at', null).select('*')
  const row = claimed?.[0] as Record<string, unknown> | undefined
  const bad = (d: string): OAuthError => ({ error: 'invalid_grant', error_description: d })
  if (!row) return bad('Code is invalid or was already used.')
  if (Date.parse(row.expires_at as string) < Date.now()) return bad('Code expired.')
  if (row.client_id !== a.clientId) return bad('Code was issued to another client.')
  if (row.redirect_uri !== a.redirectUri) return bad('redirect_uri does not match.')
  if (!verifyPkce(a.verifier, row.code_challenge as string)) return bad('PKCE verification failed.')
  const user = await eligibleUser(supabase, row.user_id as string)
  if (!user) return bad('This account can no longer connect assistants.')
  return issueTokens(supabase, { clientId: a.clientId, userId: row.user_id as string, tenantId: user.tenantId, scopes: row.scopes as string[] })
}

export async function refreshTokens(supabase: Svc, a: { refreshToken: string; clientId: string }): Promise<TokenSet | OAuthError> {
  const hash = sha256(a.refreshToken)
  const bad = (d: string): OAuthError => ({ error: 'invalid_grant', error_description: d })
  const { data: rotated } = await supabase.from('oauth_tokens').update({ used_at: new Date().toISOString() })
    .eq('token_hash', hash).eq('kind', 'refresh').is('used_at', null).is('revoked_at', null).select('*')
  const row = rotated?.[0] as Record<string, unknown> | undefined
  if (!row) {
    // Already used or revoked. A replayed refresh token means it leaked:
    // revoke the whole grant so the thief and the client both lose it.
    const { data: seen } = await supabase.from('oauth_tokens').select('family_id').eq('token_hash', hash).maybeSingle()
    if (seen?.family_id) await revokeFamily(supabase, seen.family_id as string)
    return bad('Refresh token is invalid or was already used.')
  }
  if (row.client_id !== a.clientId) { await revokeFamily(supabase, row.family_id as string); return bad('Refresh token was issued to another client.') }
  if (Date.parse(row.expires_at as string) < Date.now()) return bad('Refresh token expired.')
  const user = await eligibleUser(supabase, row.user_id as string)
  if (!user) { await revokeFamily(supabase, row.family_id as string); return bad('This account can no longer connect assistants.') }
  // Old access tokens of this grant stop working once a new pair is issued.
  await supabase.from('oauth_tokens').update({ revoked_at: new Date().toISOString() })
    .eq('family_id', row.family_id as string).eq('kind', 'access').is('revoked_at', null)
  return issueTokens(supabase, { clientId: a.clientId, userId: row.user_id as string, tenantId: user.tenantId, scopes: row.scopes as string[], familyId: row.family_id as string })
}

export async function revokeFamily(supabase: Svc, familyId: string, userId?: string) {
  let q = supabase.from('oauth_tokens').update({ revoked_at: new Date().toISOString() }).eq('family_id', familyId).is('revoked_at', null)
  if (userId) q = q.eq('user_id', userId)
  await q
}

export interface OAuthPrincipal { tokenId: string; familyId: string; clientId: string; userId: string; tenantId: string | null; scopes: string[] }

/** Resolve a presented access token. Null when unknown, expired or revoked. */
export async function verifyAccessToken(supabase: Svc, token: string): Promise<OAuthPrincipal | null> {
  if (!token.startsWith(ACCESS_PREFIX)) return null
  const { data } = await supabase.from('oauth_tokens')
    .select('id, family_id, client_id, user_id, tenant_id, scopes, expires_at, revoked_at')
    .eq('token_hash', sha256(token)).eq('kind', 'access').maybeSingle()
  if (!data || data.revoked_at || Date.parse(data.expires_at as string) < Date.now()) return null
  supabase.from('oauth_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
    .then(() => undefined, () => undefined)
  return {
    tokenId: data.id as string, familyId: data.family_id as string, clientId: data.client_id as string,
    userId: data.user_id as string, tenantId: (data.tenant_id as string | null) ?? null, scopes: (data.scopes as string[]) ?? [],
  }
}
