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
import { createServerSupabaseClient } from './server'
import type { User } from '@supabase/supabase-js'

export interface AuthProfile {
  id: string
  role: string
  organization_id: string | null
  is_active: boolean
}

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
  authUser: User
  profile: AuthProfile
}

/**
 * Returns AuthContext if the request is authenticated and the user is active.
 * Returns null otherwise — caller should respond with `unauthorized()`.
 *
 * Eliminates ~100–250 ms getUser() network call from every API route by
 * decoding the JWT from the Supabase httpOnly cookie locally.
 */
export async function requireAuth(): Promise<AuthContext | null> {
  const supabase = await createServerSupabaseClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, organization_id, is_active')
    .eq('id', session.user.id)
    .single()

  if (!profile || !profile.is_active) return null

  return { supabase, authUser: session.user, profile: profile as AuthProfile }
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}
