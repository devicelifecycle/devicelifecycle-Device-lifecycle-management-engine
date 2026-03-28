#!/usr/bin/env node
/**
 * Create Acme Corporation organization user for login.
 * Login: acme or acme@login.local, Password: Test123!
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
  // Find Acme Corporation organization (type customer)
  const { data: acmeOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('type', 'customer')
    .ilike('name', '%Acme%')
    .limit(1)
    .maybeSingle()

  const orgId = acmeOrg?.id || '00000000-0000-0000-0000-000000000002' // seed default

  if (!acmeOrg) {
    console.log('Using default Acme org id:', orgId)
  } else {
    console.log('Found Acme org:', acmeOrg.id)
  }

  // Ensure Acme Customer record is linked to org
  await supabase
    .from('customers')
    .update({ organization_id: orgId })
    .eq('company_name', 'Acme Corporation')

  // Create acme@login.local user
  const email = 'acme@login.local'
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Acme Corporation' },
  })

  if (authError) {
    if (authError.message?.includes('already been registered')) {
      const { data: users } = await supabase.auth.admin.listUsers()
      const user = users?.users?.find((u) => u.email === email)
      if (user) {
        await supabase.from('users').upsert({
          id: user.id,
          email,
          full_name: 'Acme Corporation',
          role: 'customer',
          organization_id: orgId,
          is_active: true,
        }, { onConflict: 'id' })
        console.log('Updated existing acme user -> org', orgId)
      }
    } else {
      console.error('Auth error:', authError.message)
      process.exit(1)
    }
  } else {
    await supabase.from('users').insert({
      id: authData.user.id,
      email,
      full_name: 'Acme Corporation',
      role: 'customer',
      organization_id: orgId,
      is_active: true,
    })
    console.log('Created acme user -> org', orgId)
  }

  console.log('\nAcme Corporation login:')
  console.log('  Login ID: acme')
  console.log('  Email: acme@login.local')
  console.log('  Password: Test123!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
