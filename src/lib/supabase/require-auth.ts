// ============================================================================
// FAST AUTH GUARD — for Route Handlers
// ============================================================================
//
// Uses getSession() (local JWT decode from cookie, no network round-trip)
// instead of getUser() (HTTP call to Supabase Auth, ~100–250 ms).
//
// Security tradeoff: JWT signature is verified by @supabase/ssr when reading
// from the httpOnly cookie, and expiry is enforced. Revocation lag is at most
// the JWT TTL (1 hour) — acceptable for this corporate internal app where
// Supabase auto-refreshes tokens and the 5-minute client health-check would
// sign out any invalidated user anyway.
//
// The users.is_active check is still performed per-request so a deactivated
// account is blocked even within the JWT window.

import { cache } from 'react'
import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { createServerSupabaseClient } from './server'
import type { User } from '@supabase/supabase-js'
import { getClientIp, ipInAllowlist } from '@/lib/network'

/**
 * Why a request was denied. requireAuth() returns null for every failure so
 * its 150+ call sites stay unchanged, and this records WHICH failure it was so
 * unauthorized() can answer 403 instead of 401 for an MFA block.
 *
 * That distinction is the whole point: a 401 tells the client "you are logged
 * out", so it bounces to /login — which would loop a user away from /profile,
 * the one page where they can actually enrol and clear the block.
 *
 * React cache() is per-request, so this cannot leak between concurrent
 * requests. It is already used this way in a route handler by getServerTenant.
 */
type DenyReason = 'unauthenticated' | 'mfa_required'
const requestDenyState = cache((): { reason: DenyReason } => ({ reason: 'unauthenticated' }))

/**
 * Authenticator Assurance Level from the access token. Supabase sets aal2 once
 * a user has completed an MFA challenge; a user with no enrolled factor can
 * never reach it. Decoded locally — no network call on the hot path.
 */
export function accessTokenAal(accessToken: string | undefined): string | null {
  if (!accessToken) return null
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const claims = JSON.parse(json) as { aal?: unknown }
    return typeof claims.aal === 'string' ? claims.aal : null
  } catch {
    return null
  }
}

export interface AuthProfile {
  id: string
  role: string
  secondary_role: string | null
  organization_id: string | null
  /** The VAR/tenant this user belongs to (multi-tenant isolation). */
  tenant_id: string | null
  /** Region a delegated VAR user is scoped to (Regional Manager). */
  region: string | null
  is_active: boolean
  is_org_admin: boolean
}

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  authUser: User
  profile: AuthProfile
  /** The role currently in use — primary or secondary, validated against DB */
  effectiveRole: string
  /** The VAR/tenant this request belongs to — scope all tenant data by this. */
  tenantId: string | null
  /** True when the current admin session is impersonating another user. */
  impersonating?: boolean
  /** The real admin user id when impersonating (the audit actor). */
  actorId?: string
}

/**
 * Returns AuthContext if the request is authenticated and the user is active.
 * Returns null otherwise — caller should respond with `unauthorized()`.
 *
 * Eliminates ~100–250 ms getUser() network call from every API route by
 * decoding the JWT from the Supabase httpOnly cookie locally.
 *
 * effectiveRole: reads dlm_active_role cookie and validates it against the DB
 * role/secondary_role — falls back to primary role if cookie is absent or invalid.
 */
export async function requireAuth(): Promise<AuthContext | null> {
  const supabase = await createServerSupabaseClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, secondary_role, organization_id, tenant_id, region, is_active, is_org_admin, tenants(branding)')
    .eq('id', session.user.id)
    .single()

  if (!profile || profile.is_active === false) return null

  // IP allowlist enforcement (tenant-level network policy).
  const tenantRow = (profile as unknown as { tenants?: Record<string, unknown> | Record<string, unknown>[] }).tenants
  const tenantBranding = Array.isArray(tenantRow) ? tenantRow[0] : tenantRow
  const allowedIps = (tenantBranding as { branding?: { allowedIps?: string[] | null } } | undefined)?.branding?.allowedIps
  if (Array.isArray(allowedIps) && allowedIps.length > 0) {
    const h = await headers()
    if (!ipInAllowlist(getClientIp(h), allowedIps)) return null
  }

  // MFA enforcement (tenant-level policy). Opt-in per tenant: when branding
  // .requireMfa is not explicitly true this is a no-op, so nothing changes for
  // a tenant that hasn't turned it on.
  //
  // aal2 means the user completed an MFA challenge. A user with no enrolled
  // factor can never reach aal2, so this covers both "never enrolled" and
  // "enrolled but signed in without the second factor". Enabling MFA therefore
  // requires everyone to re-authenticate — that is the intent of turning it on,
  // not a bug.
  //
  // The remediation path stays open: /profile enrols through the Supabase
  // client directly, never through these API routes, so a blocked user can
  // always reach the page that clears the block.
  const requireMfa = (tenantBranding as { branding?: { requireMfa?: boolean | null } } | undefined)?.branding?.requireMfa
  if (requireMfa === true && accessTokenAal(session.access_token) !== 'aal2') {
    requestDenyState().reason = 'mfa_required'
    return null
  }

  // Core operational roles + delegated VAR roles (Appendix A). VAR roles are
  // accepted here so a provisioned VAR user can authenticate; their data access
  // is narrowed by tenant RLS + delegated scoping, not by this list.
  const VALID_ROLES = [
    'admin', 'coe_manager', 'coe_tech', 'sales', 'customer', 'vendor',
    'var_entity_admin', 'var_regional_manager', 'var_sales_rep',
  ]

  const cookieStore = await cookies()
  const activeRoleRaw = cookieStore.get('dlm_active_role')?.value
  const activeRoleCookie = activeRoleRaw ? decodeURIComponent(activeRoleRaw) : null
  const effectiveRole =
    activeRoleCookie &&
    (activeRoleCookie === profile.role || activeRoleCookie === profile.secondary_role)
      ? activeRoleCookie
      : profile.role

  if (!VALID_ROLES.includes(effectiveRole)) return null

  // ── Impersonation override (admin acting as another user) ───────────────
  // The admin UI sets an opaque audit-id cookie `bb_impersonate_id`. If it
  // resolves to an active impersonation_log row whose actor is this admin, we
  // swap the effective identity to the target so all downstream data scoping
  // (tenantId, role, profile) runs as the impersonated user. Fully audited.
  //
  // effectiveRole === 'admin' is re-checked here (not just actor_id) so that
  // an admin whose role gets revoked mid-session immediately loses the swap on
  // their very next request — the historical fact that they started the
  // session as an admin isn't enough to keep honoring it.
  const impersonationCookie = cookieStore.get('bb_impersonate_id')?.value
  if (impersonationCookie) {
    const { data: imp } = await supabase
      .from('impersonation_log')
      .select('id, actor_id, target_user_id')
      .eq('id', impersonationCookie)
      .is('ended_at', null)
      .maybeSingle()
    if (imp && imp.actor_id === profile.id && effectiveRole === 'admin') {
      const { data: target } = await supabase
        .from('users')
        .select('id, role, secondary_role, organization_id, tenant_id, region, is_active, is_org_admin')
        .eq('id', imp.target_user_id)
        .single()
      if (target && target.is_active !== false) {
        const swapped = target as AuthProfile
        const impActiveRoleRaw = cookieStore.get('dlm_active_role')?.value
        const impActiveRole = impActiveRoleRaw ? decodeURIComponent(impActiveRoleRaw) : null
        const impEffectiveRole =
          impActiveRole && (impActiveRole === swapped.role || impActiveRole === swapped.secondary_role)
            ? impActiveRole
            : swapped.role
        return {
          supabase,
          authUser: session.user,
          profile: swapped,
          effectiveRole: impEffectiveRole,
          tenantId: swapped.tenant_id ?? null,
          impersonating: true,
          actorId: imp.actor_id,
        }
      }
    }
  }

  return { supabase, authUser: session.user, profile: profile as AuthProfile, effectiveRole, tenantId: (profile as AuthProfile).tenant_id ?? null }
}

/**
 * The standard deny response for a null requireAuth().
 *
 * Stays 401 for a genuine "not signed in", but answers 403 with a machine
 * readable code when the block was an unmet MFA policy — the client treats 401
 * as "session gone" and redirects to /login, which would bounce the user away
 * from /profile where they enrol. Signature is unchanged and it stays
 * synchronous, so all 154 call sites (10 of which use it inside synchronous
 * guard helpers) keep working untouched.
 */
export function unauthorized(message = 'Unauthorized') {
  let reason: DenyReason = 'unauthenticated'
  try {
    reason = requestDenyState().reason
  } catch {
    // cache() outside a request scope — fall back to the plain 401.
  }
  if (reason === 'mfa_required') {
    return NextResponse.json(
      { error: 'Two-factor authentication is required by your organization.', code: 'mfa_required' },
      { status: 403 },
    )
  }
  return NextResponse.json({ error: message }, { status: 401 })
}