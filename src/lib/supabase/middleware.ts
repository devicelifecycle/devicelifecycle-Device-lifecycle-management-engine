// ============================================================================
// SUPABASE MIDDLEWARE CLIENT
// ============================================================================

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseUrl = rawUrl.startsWith('https://') ? rawUrl : 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, ...options } of cookiesToSet) {
            request.cookies.set({ name, value, ...options })
          }
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          for (const { name, value, ...options } of cookiesToSet) {
            response.cookies.set({ name, value, ...options })
          }
        },
      },
    }
  )

  await supabase.auth.getUser()

  return response
}

// Function that returns both supabase client and response for middleware use
export function createMiddlewareSupabaseClient(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, ...options } of cookiesToSet) {
            request.cookies.set({ name, value, ...options })
          }
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          for (const { name, value, ...options } of cookiesToSet) {
            response.cookies.set({ name, value, ...options })
          }
        },
      },
    }
  )

  return { supabase, response }
}
