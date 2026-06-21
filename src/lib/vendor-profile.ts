type ServiceRoleClientLike = {
  from: any
}

type VendorProfileSeed = {
  full_name?: string | null
  email?: string | null
  notification_email?: string | null
  phone?: string | null
}

type VendorRecord = {
  id: string
  organization_id?: string | null
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone?: string | null
  is_active?: boolean
}

/** Mirrors ensureCustomerProfileForOrganization (src/lib/customer-profile.ts) for vendors. */
export async function ensureVendorProfileForOrganization(
  serviceRole: ServiceRoleClientLike,
  organizationId: string,
  profile: VendorProfileSeed,
): Promise<VendorRecord> {
  const { data: existingVendors, error: existingVendorError } = await serviceRole
    .from('vendors')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)

  if (existingVendorError) {
    throw existingVendorError
  }

  const existingVendor = existingVendors?.[0]
  if (existingVendor) {
    return existingVendor as VendorRecord
  }

  const { data: organization, error: organizationError } = await serviceRole
    .from('organizations')
    .select('name, contact_email, contact_phone, address')
    .eq('id', organizationId)
    .single()

  if (organizationError || !organization) {
    throw organizationError || new Error('No vendor profile found for this organization')
  }

  const fallbackEmail =
    organization.contact_email ||
    profile.notification_email ||
    (typeof profile.email === 'string' && !profile.email.endsWith('@login.local') ? profile.email : null) ||
    `contact+${organizationId}@dlm.local`

  const { data: createdVendor, error: createError } = await serviceRole
    .from('vendors')
    .insert({
      organization_id: organizationId,
      company_name: organization.name,
      contact_name: profile.full_name || organization.name,
      contact_email: fallbackEmail,
      contact_phone: organization.contact_phone || profile.phone || null,
      address: organization.address || null,
      is_active: true,
    })
    .select()
    .single()

  if (createError || !createdVendor) {
    throw createError || new Error('Failed to create vendor profile')
  }

  return createdVendor as VendorRecord
}
