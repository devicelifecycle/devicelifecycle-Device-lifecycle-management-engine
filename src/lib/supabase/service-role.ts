// ============================================================================
// SUPABASE SERVICE-ROLE CLIENT
// ============================================================================
// Use ONLY for server-side operations that run without user context
// (webhooks, cron jobs, background workers, bootstrap scripts). Bypasses RLS.
import { createClient } from '@supabase/supabase-js'
import { readServerEnv, readServerEnvAny } from '@/lib/server-env'

export function createServiceRoleClient() {
  const supabaseUrl = readServerEnvAny(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) || ''
  const serviceRoleKey = readServerEnv('SUPABASE_SERVICE_ROLE_KEY') || ''

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for service-role client'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
