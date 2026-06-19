// ============================================================================
// ORGANIZATIONS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { OrganizationService } from '@/services/organization.service'
import { CustomerService } from '@/services/customer.service'
import { VendorService } from '@/services/vendor.service'
import { createOrganizationSchema } from '@/lib/validations'
import { UserProvisioningService } from '@/services/user-provisioning.service'
import type { OrganizationType } from '@/types'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    // Get user role and org for access control
    // Customer/vendor can only see their own organization (fail-closed if no profile)
    if (!profile || ['customer', 'vendor'].includes(profile.role)) {
      if (!profile?.organization_id) {
        return NextResponse.json({ data: [], total: 0, page: 1, page_size: 20, total_pages: 0 })
      }
      const org = await OrganizationService.getOrganizationById(profile.organization_id)
      return NextResponse.json({ data: org ? [org] : [], total: org ? 1 : 0, page: 1, page_size: 20, total_pages: org ? 1 : 0 })
    }

    const searchParams = request.nextUrl.searchParams
    const filters = {
      search: searchParams.get('search') || undefined,
      type: (searchParams.get('type') as OrganizationType) || undefined,
      page: Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000),
      page_size: Math.min(Math.max(parseInt(searchParams.get('page_size') || searchParams.get('limit') || '20'), 1), 100),
    }

    const result = await OrganizationService.getOrganizations(filters)

    // Attach role flags so the admin UI can show "Customer + Vendor" for
    // dual-role orgs instead of relying on the single (primary) type field,
    // and decide whether to offer "Add Vendor role" / "Add Customer role".
    const orgIds = result.data.map((org) => org.id)
    let customerOrgIds = new Set<string>()
    let vendorOrgIds = new Set<string>()
    if (orgIds.length > 0) {
      const [{ data: customerRows }, { data: vendorRows }] = await Promise.all([
        supabase.from('customers').select('organization_id').in('organization_id', orgIds),
        supabase.from('vendors').select('organization_id').in('organization_id', orgIds),
      ])
      customerOrgIds = new Set((customerRows || []).map((r) => r.organization_id))
      vendorOrgIds = new Set((vendorRows || []).map((r) => r.organization_id))
    }

    const enrichedData = result.data.map((org) => ({
      ...org,
      has_customer_role: customerOrgIds.has(org.id),
      has_vendor_role: vendorOrgIds.has(org.id),
    }))

    return NextResponse.json({ ...result, data: enrichedData })
  } catch (error) {
    console.error('Error fetching organizations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch organizations' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — admin or COE manager role required' }, { status: 403 })
    }

    const body = await request.json()

    // Validate input
    const validationResult = createOrganizationSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { address, city, state, zip_code, country, phone, email, website, ...rest } = validationResult.data

    // Reuse an existing org by name/email regardless of its current type —
    // a company that already exists as a vendor org and is now being added
    // as a customer (or vice versa) should become dual-role (gain the other
    // linked table row), not get a second, duplicate organization row with
    // the same name.
    const [
      { data: existingOrgByEmail, error: existingOrgByEmailError },
      { data: existingOrgByName, error: existingOrgByNameError },
    ] = await Promise.all([
      email ? supabase.from('organizations').select('*').eq('contact_email', email).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from('organizations').select('*').eq('name', rest.name).maybeSingle(),
    ])
    if (existingOrgByEmailError) throw existingOrgByEmailError
    if (existingOrgByNameError) throw existingOrgByNameError

    const existingOrg = existingOrgByEmail || existingOrgByName
    const organization = existingOrg || await OrganizationService.createOrganization({
      ...rest,
      address: { street: address, city, state, zip_code, country },
      contact_email: email,
      contact_phone: phone,
    })

    // Create the linked record for the REQUESTED role (rest.type), not
    // organization.type — when reusing an existing org that's becoming
    // dual-role, organization.type still reflects its original/primary
    // role, but the admin is asking to add a different one here.
    const requestedType = rest.type
    if (requestedType === 'customer') {
      const { data: existingCustomerRow } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organization.id)
        .maybeSingle()

      if (!existingCustomerRow) {
        const defaultEmail = `contact@${organization.name.toLowerCase().replace(/\s+/g, '')}.local`
        await CustomerService.createCustomer(
          {
            company_name: organization.name,
            contact_name: organization.name,
            contact_email: organization.contact_email || defaultEmail,
            contact_phone: organization.contact_phone,
            billing_address: organization.address as Record<string, unknown> | undefined,
            shipping_address: organization.address as Record<string, unknown> | undefined,
          },
          organization.id
        )
      }
    }

    if (requestedType === 'vendor') {
      const { data: existingVendorRow } = await supabase
        .from('vendors')
        .select('id')
        .eq('organization_id', organization.id)
        .maybeSingle()

      if (!existingVendorRow) {
        await VendorService.createVendor(
          {
            company_name: organization.name,
            contact_name: organization.name,
            contact_email: organization.contact_email || `contact@${organization.name.toLowerCase().replace(/\s+/g, '')}.local`,
            contact_phone: organization.contact_phone,
            address: (organization.address as {
              street?: string
              city?: string
              state?: string
              zip?: string
              zip_code?: string
              country?: string
            }) && {
              street: String((organization.address as { street?: string }).street || ''),
              city: String((organization.address as { city?: string }).city || ''),
              state: String((organization.address as { state?: string }).state || ''),
              zip: String(
                (organization.address as { zip?: string; zip_code?: string }).zip ||
                (organization.address as { zip?: string; zip_code?: string }).zip_code ||
                ''
              ),
              country: String((organization.address as { country?: string }).country || 'Canada'),
            },
          },
          organization.id
        )
      }
    }

    // Portal login provisioning is best-effort: if this email already has a
    // login elsewhere (Supabase Auth requires globally unique emails), the
    // organization is still created — it just won't get its own portal
    // account yet.
    const shouldProvisionPortalUser = requestedType === 'customer' || requestedType === 'vendor'
    let provisioned: { created: boolean; emailSentTo?: string | null; emailSent?: boolean; skippedReason?: string | null } | null = null
    if (shouldProvisionPortalUser) {
      try {
        provisioned = await UserProvisioningService.provisionUser({
          fullName: organization.name,
          email: organization.contact_email!,
          role: requestedType === 'customer' ? 'customer' : 'vendor',
          organizationId: organization.id,
          oneUserPerRolePerOrganization: true,
        })
      } catch (provisionError) {
        provisioned = {
          created: false,
          skippedReason: provisionError instanceof Error ? provisionError.message : 'Portal login could not be created',
        }
      }
    }

    return NextResponse.json(
      {
        ...organization,
        portal_account_created: provisioned?.created ?? false,
        welcome_email_sent_to: provisioned?.emailSentTo ?? null,
        welcome_email_sent: provisioned?.emailSent ?? false,
        portal_account_skipped_reason: provisioned?.skippedReason ?? null,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating organization:', error)
    const message = error instanceof Error ? error.message : 'Failed to create organization'
    return NextResponse.json(
      { error: message },
      { status: message.includes('exists') || message.includes('Email') ? 400 : 500 }
    )
  }
}
