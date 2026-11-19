// ============================================================================
// SUPABASE CLIENT - Server Client
// ============================================================================
// createServerSupabaseClient(): the RLS-scoped client every route and service
// uses. Normally the signed-in user's own cookie session. While a platform
// admin is impersonating someone, it is instead a client running as the
// TARGET user (see impersonation-session.ts), so RLS returns the target's rows
// — not the admin's — on every read and write made during the session.
//
// createCookieSupabaseClient(): always the real cookie session. Only identity
// code (requireAuth) should use it.

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external'
import { createServiceRoleClient } from './service-role'
import { impersonationAccessToken, clientForToken } from './impersonation-session'
import { actingUser } from './acting-user'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseUrl = rawUrl.startsWith('https://') ? rawUrl : 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function createCookieSupabaseClient() {
  try {
    const cookieStore = await cookies()

    return createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              for (const { name, value, ...options } of cookiesToSet) {
                cookieStore.set({ name, value, ...options })
              }
            } catch {
            }
          },
        },
      }
    )
  } catch {
    // Never fall back to service-role — that would bypass RLS for unauthenticated
    // requests. Use the anon key so RLS policies still apply.
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
}

export interface VerifiedImpersonation {
  id: string
  actorId: string
  target: {
    id: string; role: string; secondary_role: string | null; organization_id: string | null
    tenant_id: string | null; region: string | null; is_active: boolean; is_org_admin: boolean
    email: string | null
  }
}

// One verification per request (many queries per request call the client).
const perRequest = new WeakMap<object, Promise<VerifiedImpersonation | null>>()
function requestKey(): object | null {
  try { return (workUnitAsyncStorage.getStore() as object) ?? null } catch { return null }
}

/**
 * The active impersonation for this request, or null. Valid only when: the
 * bb_impersonate_id cookie names an open impersonation_log row; its actor is
 * the signed-in user; that user is an active admin acting AS admin (not
 * switched to a secondary role); the target is active and not an admin.
 * Lookups use the service role because tenant RLS would hide a VAR's rows
 * from the admin's own session.
 */
export async function verifiedImpersonation(): Promise<VerifiedImpersonation | null> {
  let cookieStore
  try { cookieStore = await cookies() } catch { return null }
  const impId = cookieStore.get('bb_impersonate_id')?.value
  if (!impId) return null // the common case: no extra work at all

  const key = requestKey()
  const cached = key ? perRequest.get(key) : undefined
  if (cached) return cached

  const p = (async (): Promise<VerifiedImpersonation | null> => {
    const rawActive = cookieStore.get('dlm_active_role')?.value
    const activeRole = rawActive ? decodeURIComponent(rawActive) : null
    const own = await createCookieSupabaseClient()
    const { data: { session } } = await own.auth.getSession()
    if (!session?.user) return null
    const svc = createServiceRoleClient()
    const { data: imp } = await svc.from('impersonation_log')
      .select('id, actor_id, target_user_id').eq('id', impId).is('ended_at', null).maybeSingle()
    if (!imp || imp.actor_id !== session.user.id) return null
    const [{ data: actor }, { data: target }] = await Promise.all([
      svc.from('users').select('role, secondary_role, is_active').eq('id', imp.actor_id).maybeSingle(),
      svc.from('users').select('id, email, role, secondary_role, organization_id, tenant_id, region, is_active, is_org_admin')
        .eq('id', imp.target_user_id).maybeSingle(),
    ])
    // Same effective-role rule as requireAuth: the active-role cookie counts
    // only when it names one of the user's own roles. Must resolve to admin.
    const effective = actor && activeRole && (activeRole === actor.role || activeRole === actor.secondary_role)
      ? activeRole : actor?.role
    if (!actor || effective !== 'admin' || actor.is_active === false) return null
    if (!target || target.is_active === false || target.role === 'admin') return null
    return { id: imp.id as string, actorId: imp.actor_id as string, target: target as VerifiedImpersonation['target'] }
  })()
  if (key) perRequest.set(key, p)
  return p
}

/**
 * `identity: true` → always the real cookie session (requireAuth uses it to
 * learn who is signed in; the impersonation client has no session of its own).
 */
export async function createServerSupabaseClient(opts: { identity?: boolean } = {}) {
  if (opts.identity) return createCookieSupabaseClient()
  // MCP connector acting for a signed-in user: run under their RLS.
  const acting = actingUser()
  if (acting) return clientForToken(acting.accessToken)
  const imp = await verifiedImpersonation()
  if (imp) {
    try {
      return clientForToken(await impersonationAccessToken(imp.id, imp.target.id))
    } catch (err) {
      // Fail closed: never fall back to the admin's own session, which is the
      // mixed-data bug this exists to prevent. An anon client sees nothing.
      console.error('impersonation: could not act as target', err)
      return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    }
  }
  return createCookieSupabaseClient()
}
