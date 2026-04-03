#!/usr/bin/env node
/**
 * Remove duplicate/legacy test users from auth and users table.
 * Keeps only the canonical seeded identities for admin/COE plus the portal login IDs.
 *
 * Removes: *@test.example.com, admin@example.com, manager@example.com, etc.
 *
 * Usage:
 *   npm run cleanup-users
 *
 * Note: May fail if duplicate users have orders; run seed-test-users after cleanup.
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const KEEP_EMAILS = new Set([
  'devicelifecycle@gmail.com',
  'faisal.a@genovation.ai',
  'coetech@login.local',
  'sales@login.local',
  'customer@login.local',
  'vendor@login.local',
])

const CANONICAL_INTERNAL_ROLE_EMAILS = {
  admin: 'devicelifecycle@gmail.com',
  coe_manager: 'faisal.a@genovation.ai',
  coe_tech: 'coetech@login.local',
}

const REMOVE_PATTERNS = [
  /@test\.example\.com$/,
  /admin@example\.com/,
  /manager@example\.com/,
  /tech@example\.com/,
  /sales@example\.com/,
  /customer@example\.com/,
  /vendor@example\.com/,
  /@enterprise-engine\.com$/,
]

function shouldRemove({ email, role }) {
  if (!email) return false
  if (KEEP_EMAILS.has(email)) return false
  if (role && CANONICAL_INTERNAL_ROLE_EMAILS[role]) {
    return email !== CANONICAL_INTERNAL_ROLE_EMAILS[role]
  }
  if (/^(admin|coemgr)@login\.local$/i.test(email)) return true
  return REMOVE_PATTERNS.some((p) => p.test(email))
}

if (!URL || !SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('Fetching auth users...')
  const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 500,
  })

  if (listError) {
    console.error('Failed to list users:', listError.message)
    process.exit(1)
  }

  const authUserIds = (authUsers?.users || []).map((user) => user.id)
  const { data: profiles, error: profileError } = await supabase
    .from('users')
    .select('id, role, email')
    .in('id', authUserIds)

  if (profileError) {
    console.error('Failed to load user profiles:', profileError.message)
    process.exit(1)
  }

  const rolesByUserId = new Map((profiles || []).map((profile) => [profile.id, profile.role]))
  const toRemove = (authUsers?.users || []).filter((u) => shouldRemove({
    email: u.email,
    role: rolesByUserId.get(u.id),
  }))
  if (toRemove.length === 0) {
    console.log('No duplicate users found to remove.')
    return
  }

  console.log(`Removing ${toRemove.length} duplicate user(s):`)
  for (const u of toRemove) {
    console.log('  -', u.email)
  }

  // Reassign orders to first kept user (created_by_id is NOT NULL)
  const kept = await supabase.from('users').select('id').in('email', [...KEEP_EMAILS]).limit(1).single()
  const fallbackUserId = kept?.data?.id

  for (const u of toRemove) {
    if (fallbackUserId) {
      await supabase.from('orders').update({ created_by_id: fallbackUserId }).eq('created_by_id', u.id)
      await supabase.from('orders').update({ assigned_to_id: fallbackUserId }).eq('assigned_to_id', u.id)
    }

    const { error: deleteProfile } = await supabase.from('users').delete().eq('id', u.id)
    if (deleteProfile) {
      console.error(`  Skipped ${u.email} (has references?):`, deleteProfile.message)
      continue
    }

    const { error: deleteAuth } = await supabase.auth.admin.deleteUser(u.id)
    if (deleteAuth) {
      console.error(`  Failed to delete auth for ${u.email}:`, deleteAuth.message)
    }
  }

  console.log('\nDone. Kept only:', [...KEEP_EMAILS].join(', '))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
