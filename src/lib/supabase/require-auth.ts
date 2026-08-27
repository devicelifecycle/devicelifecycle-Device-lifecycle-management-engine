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

import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { createServerSupabaseClient } from './server'
import type { User } from '@supabase/supabase-js'
import { getClientIp, ipInAllowlist } from '@/lib/network'

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

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}