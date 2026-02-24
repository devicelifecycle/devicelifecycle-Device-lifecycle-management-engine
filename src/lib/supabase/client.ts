// ============================================================================
// SUPABASE CLIENT - Browser Client
// ============================================================================

import { createBrowserClient } from '@supabase/ssr'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseUrl = rawUrl.startsWith('https://') ? rawUrl : 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

// Suppress unhandled AbortError rejections from Supabase auth-js navigator.locks
// These are caused by React Strict Mode double-mount/unmount in development
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (
      event.reason instanceof DOMException &&
      event.reason.name === 'AbortError'
    ) {
      event.preventDefault()
    }
  })
}

// Singleton — prevents multiple GoTrueClient instances fighting over browser locks
let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }
  return browserClient
}

// Alias for compatibility
export const createBrowserSupabaseClient = createClient
