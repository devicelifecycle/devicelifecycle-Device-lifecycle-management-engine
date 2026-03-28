// ============================================================================
// SUPABASE CLIENT - Server Client
// ============================================================================

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseUrl = rawUrl.startsWith('https://') ? rawUrl : 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export function createServerSupabaseClient() {
  try {
    const cookieStore = cookies()

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
    if (supabaseServiceRoleKey) {
      return createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
}
