#!/usr/bin/env node
/**
 * Verify that test user login works (Supabase auth).
 * Usage: node --env-file=.env.local scripts/verify-login.mjs
 */
import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY)')
  process.exit(1)
}
const supabase = createClient(url, key)
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'admin@login.local',
  password: 'Test123!',
})
if (error) {
  console.error('Login failed:', error.message)
  process.exit(1)
}
console.log('Login OK. User:', data.user?.id)
process.exit(0)
