// ============================================================================
// PROXY
// ============================================================================

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware'
import { getProfileCache, setProfileCache } from '@/lib/cache/profile-cache'

// Routes that don't require authentication
const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/auth/callback', '/reset-password', '/value-lookup']

// Routes that require specific roles (more specific routes first)
const roleRoutes: [string, string[]][] = [
  ['/admin', ['admin']],
  ['/coe', ['admin', 'coe_manager', 'coe_tech']],
  ['/customers/new', ['admin', 'coe_manager']],
  ['/vendors/new', ['admin', 'coe_manager']],
  // Both portals are open to customer+vendor roles — data-level access is enforced
  // by API routes using effectiveRole, so the route guard just needs to allow navigation.
  ['/customer/', ['customer', 'vendor']],
  ['/vendor/', ['vendor', 'customer']],
  ['/customers', ['admin', 'coe_manager', 'sales']],
  ['/vendors', ['admin', 'coe_manager', 'sales']],
  // CPO: internal only; trade-in: internal + customer
  ['/orders/new/cpo', ['admin', 'coe_manager', 'coe_tech']],
  ['/orders/new', ['admin', 'coe_manager', 'coe_tech', 'sales', 'customer']],
  // Order detail and nested order routes are shared across internal, customer,
  // and vendor roles. The page/API layer still enforces record-level access.
  ['/orders/', ['admin', 'coe_manager', 'coe_tech', 'sales', 'customer', 'vendor']],
  ['/orders', ['admin', 'coe_manager', 'coe_tech', 'sales']],
  ['/devices', ['admin', 'coe_manager']],
  ['/reports', ['admin', 'coe_manager']],
]

// Role-based route access check — shared by fast and slow paths
function applyRoleRouting(pathname: string, role: string, request: NextRequest, response?: NextResponse): NextResponse {
  for (const [route, allowedRoles] of roleRoutes) {
    if (pathname.startsWith(route)) {
      if (!allowedRoles.includes(role)) {
        if (pathname.startsWith('/orders/new/cpo') && role === 'customer') {
          return NextResponse.redirect(new URL('/orders/new', request.url))
        }
        return NextResponse.redirect(new URL('/', request.url))
      }
      break // most specific route matched
    }
  }
  return response ?? NextResponse.next()
}

// Safe cookie decoder — returns null on malformed percent-encoding instead of throwing.
function safeDecode(value: string | undefined): string | null {
  if (!value) return null
  try { return decodeURIComponent(value) } catch { return null }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Cookie names must match those set in useAuth.ts — hoisted here so the
  // '/' fast-redirect and the authenticated fast-path share one declaration.
  const ROLE_COOKIE = 'dlm_role'
  const USER_ID_COOKIE = 'dlm_uid'
  const ACTIVE_ROLE_COOKIE = 'dlm_active_role'

  // Authenticated users hitting '/' skip the landing page bundle entirely.
  // Cookie presence means the user has a valid session (8h TTL); the actual
  // JWT is verified per-request by API routes, not here.
  if (pathname === '/') {
    const rootRole = safeDecode(request.cookies.get(ROLE_COOKIE)?.value)
    if (rootRole) {
      const activeRole = safeDecode(request.cookies.get(ACTIVE_ROLE_COOKIE)?.value) ?? rootRole
      const dest = activeRole === 'vendor' ? '/vendor/orders' : '/dashboard'
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return NextResponse.next()
  }

  // Allow public routes (prefix match — '/' is handled above)
  if (publicRoutes.some((route) => route !== '/' && pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Allow API routes (they handle their own auth)
  if (pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  // Allow static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/images') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const cachedRole = safeDecode(request.cookies.get(ROLE_COOKIE)?.value)
  const cachedUserId = safeDecode(request.cookies.get(USER_ID_COOKIE)?.value)

  // Fast path: routing cookies present — skip Supabase network round-trip entirely.
  // These cookies are set by useAuth immediately after a successful login and expire
  // in 8 hours. API routes independently validate the Supabase JWT, so this only
  // bypasses the middleware routing check, not data-layer authorization.
  // Role-spoofing via dlm_active_role is bounded to UI routing only — the data
  // layer (requireAuth in every API route) validates against the DB independently.
  if (cachedRole && cachedUserId) {
    const activeRole = safeDecode(request.cookies.get(ACTIVE_ROLE_COOKIE)?.value) ?? cachedRole
    return applyRoleRouting(pathname, activeRole, request)
  }

  // Slow path: no routing cookies — must verify session with Supabase Auth.
  // Happens on first load, after cookie expiry, or in a fresh browser.
  try {
    const { supabase, response } = createMiddlewareSupabaseClient(request)

    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!authUser) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Cookie absent — read role + full profile from DB (or in-process cache).
    // The profile cache (8h TTL, keyed by userId) eliminates the SELECT on warm
    // serverless invocations: only supabase.auth.getUser() runs (~50ms) instead
    // of both calls (~150-200ms). Cold starts still pay the full cost once.
    let dbUser = getProfileCache(authUser.id)

    if (!dbUser) {
      const { data: fetched } = await supabase
        .from('users')
        .select('role, id, email, full_name, secondary_role, organization_id, is_active, is_org_admin, onboarding_completed_at, created_at, updated_at, notification_email, notification_preferences, last_login_at')
        .eq('id', authUser.id)
        .single()
      if (fetched) setProfileCache(authUser.id, fetched)
      dbUser = fetched
    }

    if (!dbUser || dbUser.is_active === false) {
      const loginUrl = new URL('/login', request.url)
      if (dbUser?.is_active === false) loginUrl.searchParams.set('reason', 'deactivated')
      return NextResponse.redirect(loginUrl)
    }

    // Stamp routing cookies server-side so the next navigation uses the fast path
    // instead of paying another getUser() + DB round-trip. Not httpOnly so client
    // JS can also read them for the AuthProvider fast-path cache check.
    const routed = applyRoleRouting(pathname, dbUser.role, request, response)
    const cookieOpts = { path: '/', maxAge: 28800, sameSite: 'lax' as const }
    routed.cookies.set(ROLE_COOKIE, encodeURIComponent(dbUser.role), cookieOpts)
    routed.cookies.set(USER_ID_COOKIE, encodeURIComponent(authUser.id), cookieOpts)
    // Stamp the full profile cookie so layout.tsx fast-path fires on next request
    // (same fields as writeProfileCookie() in useAuth.ts, must stay in sync)
    try {
      const compact = {
        id: dbUser.id, email: dbUser.email, full_name: dbUser.full_name,
        role: dbUser.role, secondary_role: dbUser.secondary_role,
        organization_id: dbUser.organization_id, is_active: dbUser.is_active,
        is_org_admin: dbUser.is_org_admin, onboarding_completed_at: dbUser.onboarding_completed_at,
        notification_email: dbUser.notification_email, notification_preferences: dbUser.notification_preferences,
        last_login_at: dbUser.last_login_at, created_at: dbUser.created_at, updated_at: dbUser.updated_at,
      }
      routed.cookies.set('dlm_profile', encodeURIComponent(JSON.stringify(compact)), cookieOpts)
    } catch { /* non-fatal — layout falls back to DB if cookie is absent */ }
    return routed
  } catch (error) {
    // AbortError happens when browser navigates away before proxy completes — ignore it
    if (error instanceof Error && (error.name === 'AbortError' || error.message?.includes('aborted'))) {
      return NextResponse.next()
    }
    // On other errors, redirect to login
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}