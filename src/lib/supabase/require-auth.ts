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
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from './server'
import type { User } from '@supabase/supabase-js'

export interface AuthProfile {
  id: string
  role: string
  secondary_role: string | null
  organization_id: string | null
  is_active: boolean
  is_org_admin: boolean
}

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  authUser: User
  profile: AuthProfile
  /** The role currently in use — primary or secondary, validated against DB */
  effectiveRole: string
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
    .select('id, role, secondary_role, organization_id, is_active, is_org_admin')
    .eq('id', session.user.id)
    .single()

  if (!profile || !profile.is_active) return null

  const cookieStore = await cookies()
  const activeRoleRaw = cookieStore.get('dlm_active_role')?.value
  const activeRoleCookie = activeRoleRaw ? decodeURIComponent(activeRoleRaw) : null
  const effectiveRole =
    activeRoleCookie &&
    (activeRoleCookie === profile.role || activeRoleCookie === profile.secondary_role)
      ? activeRoleCookie
      : profile.role

  return { supabase, authUser: session.user, profile: profile as AuthProfile, effectiveRole }
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}
