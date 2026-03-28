// ============================================================================
// SUPABASE CLIENT - Browser Client
// ============================================================================

import { createBrowserClient } from '@supabase/ssr'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
// In production, fail fast if misconfigured; no placeholder keys that could mask config errors
const supabaseUrl =
  rawUrl.startsWith('https://') ? rawUrl
  : process.env.NODE_ENV === 'production' ? ''
  : 'https://placeholder.supabase.co'
const supabaseAnonKey =
  rawKey && rawKey.length > 10 ? rawKey
  : process.env.NODE_ENV === 'production' ? ''
  : 'placeholder-key'

// Suppress unhandled AbortError rejections from Supabase auth-js navigator.locks
// "signal is aborted without reason" — React Strict Mode, tab close, or lock timeout
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const r = event.reason
    const isAbort =
      (r instanceof DOMException && r.name === 'AbortError') ||
      (r instanceof Error && (r.name === 'AbortError' || /aborted|signal is aborted/i.test(r.message || ''))) ||
      (typeof r === 'object' && r != null && (r.name === 'AbortError' || /aborted|signal is aborted/i.test(String((r as { message?: unknown }).message || ''))))
    if (isAbort) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, true)
}

// Singleton — prevents multiple GoTrueClient instances fighting over browser locks
let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (process.env.NODE_ENV === 'production' && (!supabaseUrl || !supabaseAnonKey)) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }
  return browserClient
}

// Alias for compatibility
export const createBrowserSupabaseClient = createClient
