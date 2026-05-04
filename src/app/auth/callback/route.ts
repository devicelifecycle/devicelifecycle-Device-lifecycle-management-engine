// ============================================================================
// AUTH CALLBACK ROUTE
// Handles Supabase auth redirects (password reset, email verification, etc.)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  // Rate limit auth callbacks: 10 per 15 min per IP
  const rl = checkRateLimit(`auth-callback:${getClientIp(request)}`, RATE_LIMITS.auth)
  if (!rl.allowed) {
    return NextResponse.redirect(new URL('/login?error=rate_limited', request.url))
  }

  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/dashboard'

  // Strict whitelist to prevent open redirect (e.g. /%2f%2fevil.com)
  const ALLOWED_EXACT = ['/', '/dashboard', '/login', '/reset-password', '/orders', '/vendors', '/devices', '/customers', '/reports', '/notifications', '/profile']
  const ALLOWED_PREFIXES = ['/dashboard/', '/vendor/', '/customer/', '/orders/', '/coe/', '/admin/', '/devices/', '/customers/', '/vendors/']
  let decoded = next
  try {
    decoded = decodeURIComponent(next)
  } catch {
    decoded = '/dashboard'
  }
  const pathOnly = decoded.split('?')[0].split('#')[0]
  const isAllowed =
    pathOnly.startsWith('/') && !pathOnly.startsWith('//') && !pathOnly.includes(':') &&
    (ALLOWED_EXACT.includes(pathOnly) || ALLOWED_PREFIXES.some(p => pathOnly.startsWith(p)))
  const safeNext = isAllowed ? decoded : '/dashboard'

  if (code) {
    const cookieStore = await cookies()

    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabaseUrl =
      rawUrl.startsWith('https://') ? rawUrl
      : process.env.NODE_ENV === 'production' ? ''
      : 'https://placeholder.supabase.co'
    const supabaseAnonKey =
      rawKey && rawKey.length > 10 ? rawKey
      : process.env.NODE_ENV === 'production' ? ''
      : 'placeholder-key'

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
      return NextResponse.redirect(new URL('/login?error=config', request.url))
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL(safeNext, request.url))
    }

    // Code exchange failed (e.g. PKCE verifier missing from different device/browser).
    // If this looks like a password-reset callback, send user to request a new link.
    if (safeNext === '/reset-password' || safeNext.startsWith('/reset-password')) {
      return NextResponse.redirect(new URL('/forgot-password?reason=expired', request.url))
    }
  }

  // No code provided or non-recovery callback failed → login
  return NextResponse.redirect(new URL('/login', request.url))
}
