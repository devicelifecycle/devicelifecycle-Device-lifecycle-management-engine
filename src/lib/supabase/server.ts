// ============================================================================
// SUPABASE CLIENT - Server Client
// ============================================================================

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseUrl = rawUrl.startsWith('https://') ? rawUrl : 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export async function createServerSupabaseClient() {
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
