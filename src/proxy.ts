// ============================================================================
// PROXY
// ============================================================================

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware'

// Routes that don't require authentication
const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/auth/callback', '/reset-password']

// Routes that require specific roles (more specific routes first)
const roleRoutes: [string, string[]][] = [
  ['/admin', ['admin']],
  ['/coe', ['admin', 'coe_manager', 'coe_tech']],
  ['/customers/new', ['admin', 'coe_manager']],
  ['/vendors/new', ['admin', 'coe_manager']],
  ['/customer/', ['customer']],
  ['/vendor/', ['vendor']],
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes (exact match for '/', prefix match for others)
  if (publicRoutes.some((route) =>
    route === '/' ? pathname === '/' : pathname.startsWith(route)
  )) {
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

  // Cookie name must match the one set in useAuth.ts
  const ROLE_COOKIE = 'dlm_role'
  const USER_ID_COOKIE = 'dlm_uid'

  try {
    const { supabase, response } = createMiddlewareSupabaseClient(request)

    // getUser() validates JWT locally — faster than getSession() which can trigger token refresh
    const { data: { user: authUser } } = await supabase.auth.getUser()

    // Client-side sign-in stores the session in the browser first, then our app
    // sets short-lived routing cookies (role + user id). When the browser
    // navigates immediately after login, the Supabase auth cookie may not be
    // visible to middleware yet, but the routing cookies are. Trust them as a
    // same-browser login handoff so the user does not get bounced back to /login.
    const cachedRole = request.cookies.get(ROLE_COOKIE)?.value
      ? decodeURIComponent(request.cookies.get(ROLE_COOKIE)!.value)
      : null
    const cachedUserId = request.cookies.get(USER_ID_COOKIE)?.value
      ? decodeURIComponent(request.cookies.get(USER_ID_COOKIE)!.value)
      : null

    if (!authUser && (!cachedRole || !cachedUserId)) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Fast path: read role from the short-lived cookie set by useAuth on login.
    // This eliminates one DB round-trip (~100-200ms) on every authenticated navigation.
    const authUserId = authUser?.id ?? cachedUserId

    let role: string | null = authUser
      ? (cachedRole && cachedUserId === authUser.id ? cachedRole : null)
      : cachedRole

    if (!role) {
      // Cookie absent (first load, cookie cleared, or different browser) — fall back to DB
      const { data: dbUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUserId)
        .single()

      if (!dbUser) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
      role = dbUser.role
    }

    for (const [route, allowedRoles] of roleRoutes) {
      if (pathname.startsWith(route)) {
        if (!allowedRoles.includes(role ?? '')) {
          if (pathname.startsWith('/orders/new/cpo') && role === 'customer') {
            return NextResponse.redirect(new URL('/orders/new', request.url))
          }
          return NextResponse.redirect(new URL('/', request.url))
        }
        break // Most specific route matched — don't check broader routes
      }
    }

    return response
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