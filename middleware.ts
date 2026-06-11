// ============================================================================
// NEXT.JS EDGE MIDDLEWARE — Authentication & Route Protection
// ============================================================================
// Runs on every request BEFORE the page is rendered, at the Vercel edge.
// This is the enterprise-standard approach: auth decisions happen at the
// network layer, not inside React. Users never receive protected-page HTML
// before being validated, and authenticated users never receive login-page
// HTML before being redirected.
//
// Two responsibilities:
//   1. Refresh the Supabase JWT token if it's near expiry (keeps sessions alive)
//   2. Redirect unauthenticated users away from protected routes and
//      redirect authenticated users away from auth pages (login, register, etc.)
// ============================================================================

import { type NextRequest, NextResponse } from 'next/server'
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware'

// Auth pages — served to guests only; authenticated users are redirected to dashboard
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password']

// Public pages — accessible without authentication (no redirect either way)
const PUBLIC_PATHS = ['/']

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let Next.js internals, API routes, and static files through immediately.
  // API routes handle their own authentication via requireAuth().
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico' ||
    // Any path with a file extension is a static asset
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  // Create a middleware Supabase client and call getSession().
  // @supabase/ssr automatically refreshes an expired access token using the
  // refresh token cookie, then writes the new tokens back via setAll().
  // This is the correct pattern from Supabase's own Next.js guide and ensures
  // JWTs are kept fresh without requiring the browser client to run first.
  const { supabase, response } = createMiddlewareSupabaseClient(request)
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const authenticated = !!session

  // ── Authenticated user on an auth page ──────────────────────────────────
  // e.g. an already-logged-in user navigates to /login — redirect to dashboard.
  // Use the dlm_role cookie for a fast role-based destination; fall back to
  // /dashboard if the cookie hasn't been written yet.
  if (authenticated && isAuthPath(pathname)) {
    const role = request.cookies.get('dlm_role')?.value
    let dest = '/dashboard'
    if (role === 'customer') dest = '/customer/orders'
    else if (role === 'vendor') dest = '/vendor/orders'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // ── Unauthenticated user on a protected page ─────────────────────────────
  // Everything that isn't a public page or auth page is protected.
  if (!authenticated && !isAuthPath(pathname) && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Pass the response through so that any refreshed cookies are forwarded.
  return response
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - _next/static  (Next.js static chunks)
     * - _next/image   (image optimisation API)
     * - favicon.ico
     * - Static asset extensions (svg, png, jpg, etc.)
     *
     * API routes are excluded here and also short-circuited in the function
     * body above, so the Supabase session check never runs for API calls.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|eot)$).*)',
  ],
}
