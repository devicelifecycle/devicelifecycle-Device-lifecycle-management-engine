#!/usr/bin/env node
/**
 * Create a generic org-linked customer user for login.
 * Login: customer-org or customer-org@login.local, Password: Test123!
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = 'Test123!'

if (!URL || !SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('type', 'customer')
    .limit(1)
    .maybeSingle()

  const orgId = org?.id || '00000000-0000-0000-0000-000000000002'

  const email = 'customer-org@login.local'
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Customer Org' },
  })

  if (authError) {
    if (authError.message?.includes('already been registered')) {
      const { data: users } = await supabase.auth.admin.listUsers()
      const user = users?.users?.find((u) => u.email === email)
      if (user) {
        await supabase.from('users').upsert({
          id: user.id,
          email,
          full_name: 'Customer Org',
          role: 'customer',
          organization_id: orgId,
          is_active: true,
        }, { onConflict: 'id' })
        console.log('Updated existing customer-org user -> org', orgId)
      }
    } else {
      console.error('Auth error:', authError.message)
      process.exit(1)
    }
  } else {
    await supabase.from('users').insert({
      id: authData.user.id,
      email,
      full_name: 'Customer Org',
      role: 'customer',
      organization_id: orgId,
      is_active: true,
    })
    console.log('Created customer-org user -> org', orgId)
  }

  console.log('\nCustomer Org login:')
  console.log('  Login ID: customer-org')
  console.log('  Email: customer-org@login.local')
  console.log('  Password: Test123!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})