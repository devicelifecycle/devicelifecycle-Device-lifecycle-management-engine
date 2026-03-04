// ============================================================================
// MIDDLEWARE
// ============================================================================

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware'

// Routes that don't require authentication
const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/auth/callback', '/reset-password']

// Routes that require specific roles
const roleRoutes: Record<string, string[]> = {
  '/admin': ['admin'],
  '/coe': ['admin', 'coe_manager', 'coe_tech'],
  '/customer': ['customer'],
  '/vendor': ['vendor'],
}

export async function middleware(request: NextRequest) {
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

  try {
    const { supabase, response } = createMiddlewareSupabaseClient(request)
    
    // Get session
    const { data: { session } } = await supabase.auth.getSession()

    // Redirect to login if no session
    if (!session) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Check role-based access
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (user) {
      for (const [route, allowedRoles] of Object.entries(roleRoutes)) {
        if (pathname.startsWith(route)) {
          if (!allowedRoles.includes(user.role)) {
            // Redirect to orders page if not authorized
            return NextResponse.redirect(new URL('/dashboard', request.url))
          }
        }
      }
    }

    return response
  } catch (error) {
    // On error, redirect to login
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
