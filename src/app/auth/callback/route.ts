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
  const ALLOWED = ['/', '/dashboard', '/login', '/reset-password']
  let decoded = next
  try {
    decoded = decodeURIComponent(next)
  } catch {
    decoded = '/dashboard'
  }
  const isAllowed =
    (decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.includes(':')) &&
    (ALLOWED.includes(decoded) || decoded.startsWith('/dashboard/') || decoded.startsWith('/login'))
  const safeNext = isAllowed ? decoded : '/dashboard'

  if (code) {
    const cookieStore = cookies()

    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseUrl = rawUrl.startsWith('https://') ? rawUrl : 'https://placeholder.supabase.co'
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

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
  }

  // If no code or exchange failed, redirect to login with error
  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', request.url))
}
