#!/usr/bin/env node
/**
 * Create the first admin user for Device Lifecycle Management Engine.
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Usage:
 *   npm run create-admin
 *
 * Default: admin@login.local (login with "admin") / Test123!
 * Override: EMAIL=admin@login.local PASSWORD=Test123! node scripts/create-admin-user.mjs
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = process.env.EMAIL || 'admin@login.local'
const PASSWORD = process.env.PASSWORD || 'Test123!'
const FULL_NAME = process.env.FULL_NAME || 'Admin User'
const DEFAULT_ORG_ID = process.env.ORG_ID || '00000000-0000-0000-0000-000000000001'
const DEFAULT_ORG_NAME = process.env.ORG_NAME || 'Device Lifecycle Operations'

if (!URL || !SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  console.error('Set them in .env.local or pass as env vars.')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  console.log('Creating admin user...')
  console.log('  Email:', EMAIL)

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  })

  if (authError) {
    if (authError.message?.includes('already been registered')) {
      console.log('User already exists in Auth. Ensuring profile exists...')
      const { data: existing } = await supabase.auth.admin.listUsers()
      const user = existing?.users?.find(u => u.email === EMAIL)
      if (!user) {
        console.error('Could not find existing user.')
        process.exit(1)
      }
      await ensureProfile(user.id)
    } else {
      console.error('Auth error:', authError.message)
      process.exit(1)
    }
  } else {
    await ensureProfile(authData.user.id)
  }

  console.log('\nDone! You can now sign in with:')
  console.log('  Email:', EMAIL)
  console.log('  Password:', PASSWORD)
}

async function ensureProfile(userId) {
  const orgId = await ensureInternalOrganization()

  const { error: profileError } = await supabase.from('users').upsert({
    id: userId,
    email: EMAIL,
    full_name: FULL_NAME,
    role: 'admin',
    organization_id: orgId,
    is_active: true,
  }, { onConflict: 'id' })

  if (profileError) {
    console.error('Profile upsert error:', profileError.message)
    process.exit(1)
  }
  console.log('Profile linked in users table.')
}

async function ensureInternalOrganization() {
  const { data: existingOrg, error: lookupError } = await supabase
    .from('organizations')
    .select('id')
    .eq('type', 'internal')
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    console.error('Organization lookup error:', lookupError.message)
    process.exit(1)
  }

  if (existingOrg?.id) {
    return existingOrg.id
  }

  const { data: createdOrg, error: createOrgError } = await supabase
    .from('organizations')
    .insert({
      id: DEFAULT_ORG_ID,
      name: DEFAULT_ORG_NAME,
      type: 'internal',
      contact_email: EMAIL,
      is_active: true,
    })
    .select('id')
    .single()

  if (createOrgError || !createdOrg?.id) {
    console.error('Failed to create internal organization:', createOrgError?.message || 'Unknown error')
    process.exit(1)
  }

  console.log('Created internal organization:', DEFAULT_ORG_NAME)
  return createdOrg.id
}

main().catch(err => { console.error(err); process.exit(1) })
