type ServiceRoleClientLike = {
  from: any
}

type CustomerProfileSeed = {
  full_name?: string | null
  email?: string | null
  notification_email?: string | null
  phone?: string | null
}

type CustomerRecord = {
  id: string
  organization_id?: string | null
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone?: string | null
  is_active?: boolean
}

export async function ensureCustomerProfileForOrganization(
  serviceRole: ServiceRoleClientLike,
  organizationId: string,
  profile: CustomerProfileSeed,
): Promise<CustomerRecord> {
  const { data: existingCustomers, error: existingCustomerError } = await serviceRole
    .from('customers')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)

  if (existingCustomerError) {
    throw existingCustomerError
  }

  const existingCustomer = existingCustomers?.[0]
  if (existingCustomer) {
    return existingCustomer as CustomerRecord
  }

  const { data: organization, error: organizationError } = await serviceRole
    .from('organizations')
    .select('name, contact_email, contact_phone, address')
    .eq('id', organizationId)
    .single()

  if (organizationError || !organization) {
    throw organizationError || new Error('No customer profile found for this organization')
  }

  const fallbackEmail =
    organization.contact_email ||
    profile.notification_email ||
    (typeof profile.email === 'string' && !profile.email.endsWith('@login.local') ? profile.email : null) ||
    `contact+${organizationId}@dlm.local`

  const { data: createdCustomer, error: createError } = await serviceRole
    .from('customers')
    .insert({
      organization_id: organizationId,
      company_name: organization.name,
      contact_name: profile.full_name || organization.name,
      contact_email: fallbackEmail,
      contact_phone: organization.contact_phone || profile.phone || null,
      billing_address: organization.address || null,
      shipping_address: organization.address || null,
      is_active: true,
    })
    .select()
    .single()

  if (createError || !createdCustomer) {
    throw createError || new Error('Failed to create customer profile')
  }

  return createdCustomer as CustomerRecord
}
