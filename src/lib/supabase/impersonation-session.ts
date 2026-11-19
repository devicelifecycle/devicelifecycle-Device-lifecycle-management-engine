// ============================================================================
// IMPERSONATION SESSION — run RLS queries AS the impersonated user
// ============================================================================
// requireAuth() swaps the profile/role when an admin impersonates someone, but
// the database client stayed the admin's own session — so every RLS-backed read
// showed the admin's rows while the screen claimed to be the target user (the
// "mixed data" bug). This mints a real access token for the TARGET so the
// session-scoped Supabase client runs under the target's own RLS.
//
// How (no JWT signing secret needed): the service role generates a one-time
// magic-link token for the target and exchanges it server-side for a session.
// The session is revoked IMMEDIATELY: the refresh token dies, so nothing can
// extend it, and no extra login lingers on the user's account. The access token
// stays usable for data until it expires (≤1h), then a new one is minted.
// The token never leaves the server (no cookie, no response body).
//
// Authorization is NOT decided here: callers pass an impersonation that has
// already been verified (active log row, actor is an active admin, target is
// active and not an admin).

import { createClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from './service-role'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/** Re-mint this long before expiry so a request never starts with a dying token. */
const REFRESH_MARGIN_MS = 2 * 60_000

const tokens = new Map<string, { token: string; expiresAt: number }>()
const inFlight = new Map<string, Promise<string>>()

async function mint(targetUserId: string): Promise<{ token: string; expiresAt: number }> {
  const svc = createServiceRoleClient()
  const { data: u, error: ue } = await svc.auth.admin.getUserById(targetUserId)
  if (ue || !u?.user?.email) throw new Error('impersonation: target has no auth email')
  const { data: link, error: le } = await svc.auth.admin.generateLink({ type: 'magiclink', email: u.user.email })
  const hashed = (link as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token
  if (le || !hashed) throw new Error(`impersonation: could not mint (${le?.message ?? 'no token'})`)
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: v, error: ve } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: hashed })
  if (ve || !v?.session?.access_token) throw new Error(`impersonation: exchange failed (${ve?.message ?? 'no session'})`)
  // Revoke straight away: kills the refresh token and the session row.
  await svc.auth.admin.signOut(v.session.access_token, 'local').catch(() => undefined)
  const expiresAt = (v.session.expires_at ? v.session.expires_at * 1000 : Date.now() + 3_600_000)
  return { token: v.session.access_token, expiresAt }
}

/**
 * A Supabase access token for `userId`, cached per instance under `cacheKey`
 * (an impersonation id, or `mcp:<user id>` for the MCP connector).
 */
export async function userAccessToken(cacheKey: string, userId: string): Promise<string> {
  const hit = tokens.get(cacheKey)
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return hit.token
  const pending = inFlight.get(cacheKey)
  if (pending) return pending
  const p = mint(userId)
    .then((t) => { tokens.set(cacheKey, t); return t.token })
    .finally(() => inFlight.delete(cacheKey))
  inFlight.set(cacheKey, p)
  return p
}

/** An access token for the target of a verified impersonation. */
export function impersonationAccessToken(impersonationId: string, targetUserId: string): Promise<string> {
  return userAccessToken(impersonationId, targetUserId)
}

/** Forget a finished impersonation's token (called when the session ends). */
export function dropImpersonationToken(impersonationId: string) {
  tokens.delete(impersonationId)
}

/** A Supabase client that runs every query under the target user's RLS. */
export function clientForToken(token: string) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
