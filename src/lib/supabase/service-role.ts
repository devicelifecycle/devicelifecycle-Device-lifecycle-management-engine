// ============================================================================
// SUPABASE SERVICE-ROLE CLIENT
// ============================================================================
// Use ONLY for server-side operations that run without user context
// (webhooks, cron jobs, background workers, bootstrap scripts). Bypasses RLS.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export function createServiceRoleClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for service-role client')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
