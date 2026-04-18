import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadE2EEnv } from './env'

loadE2EEnv()

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'Test123!'

type SeedUser = {
  email: string
  full_name: string
  role: string
  organization_id: string
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Playwright global setup requires ${name} to seed E2E users.`)
  }
  return value
}

async function findExistingUserId(supabase: SupabaseClient<any>, email: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) throw error
  return data.users.find((user) => user.email === email)?.id || null
}

async function ensureAuthUser(supabase: SupabaseClient<any>, email: string, fullName: string): Promise<string> {
  const existingUserId = await findExistingUserId(supabase, email)

  if (existingUserId) {
    const { error } = await supabase.auth.admin.updateUserById(existingUserId, {
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error) throw error
    return existingUserId
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (error || !data.user?.id) {
    throw error || new Error(`Failed to create auth user for ${email}`)
  }

  return data.user.id
}

async function ensureProfile(supabase: SupabaseClient<any>, userId: string, user: SeedUser) {
  const { error } = await supabase.from('users').upsert(
    {
      id: userId,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      organization_id: user.organization_id,
      is_active: true,
    } as any,
    { onConflict: 'id' }
  )

  if (error) throw error
}

async function ensureCustomerRecord(
  supabase: SupabaseClient<any>,
  input: {
    organization_id: string
    company_name: string
    contact_name: string
    contact_email: string
  },
) {
  const { data: existing, error: existingError } = await supabase
    .from('customers')
    .select('id')
    .eq('organization_id', input.organization_id)
    .limit(1)
    .maybeSingle()

  if (existingError) throw existingError

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        company_name: input.company_name,
        contact_name: input.contact_name,
        contact_email: input.contact_email,
        is_active: true,
      })
      .eq('id', existing.id)

    if (updateError) throw updateError
    return
  }

  const { error: insertError } = await supabase
    .from('customers')
    .insert({
      ...input,
      is_active: true,
    })

  if (insertError) throw insertError
}

export default async function globalSetup() {
  const url = requireEnv(supabaseUrl, 'SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  const key = requireEnv(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: firstOrg, error: orgError } = await supabase.from('organizations').select('id').limit(1).single()
  if (orgError && !firstOrg) throw orgError
  const defaultOrgId = firstOrg?.id || '00000000-0000-0000-0000-000000000001'

  await ensureCustomerRecord(supabase, {
    organization_id: defaultOrgId,
    company_name: 'Default Customer Org',
    contact_name: 'Default Customer',
    contact_email: 'customer@example.com',
  })

  const users: SeedUser[] = [
    { email: 'admin@login.local', full_name: 'Test Admin', role: 'admin', organization_id: defaultOrgId },
    { email: 'coemgr@login.local', full_name: 'Test CoE Manager', role: 'coe_manager', organization_id: defaultOrgId },
    { email: 'coetech@login.local', full_name: 'Test CoE Tech', role: 'coe_tech', organization_id: defaultOrgId },
    { email: 'sales@login.local', full_name: 'Test Sales', role: 'sales', organization_id: defaultOrgId },
    { email: 'customer@login.local', full_name: 'Test Customer', role: 'customer', organization_id: defaultOrgId },
    { email: 'vendor@login.local', full_name: 'Test Vendor', role: 'vendor', organization_id: defaultOrgId },
    { email: 'customer-org@login.local', full_name: 'Customer Org', role: 'customer', organization_id: defaultOrgId },
  ]

  for (const user of users) {
    const userId = await ensureAuthUser(supabase, user.email, user.full_name)
    await ensureProfile(supabase, userId, user)
  }
}
