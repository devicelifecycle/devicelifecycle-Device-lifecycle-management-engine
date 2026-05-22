// ============================================================================
// VENDORS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { VendorService } from '@/services/vendor.service'
import { vendorSchema } from '@/lib/validations'
import { OrganizationService } from '@/services/organization.service'
import { UserProvisioningService } from '@/services/user-provisioning.service'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { profile } = auth

    if (['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const isActiveParam = searchParams.get('is_active')
    const filters = {
      search: searchParams.get('search') || undefined,
      is_active: isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined,
      page: Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000),
      page_size: Math.min(Math.max(parseInt(searchParams.get('page_size') || searchParams.get('limit') || '20'), 1), 100),
    }

    const result = await VendorService.getVendors(filters)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching vendors:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendors' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { supabase, profile } = auth

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only admin or COE manager can create vendors and vendor login IDs' }, { status: 403 })
    }

    const body = await request.json()
    
    // Validate input
    const validationResult = vendorSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const input = validationResult.data

    const { data: existingVendorOrgByEmail, error: existingVendorOrgByEmailError } = await supabase
      .from('organizations')
      .select('*')
      .eq('type', 'vendor')
      .eq('contact_email', input.contact_email)
      .maybeSingle()

    if (existingVendorOrgByEmailError) {
      throw existingVendorOrgByEmailError
    }

    const { data: existingVendorOrgByName, error: existingVendorOrgByNameError } = await supabase
      .from('organizations')
      .select('*')
      .eq('type', 'vendor')
      .eq('name', input.company_name)
      .maybeSingle()

    if (existingVendorOrgByNameError) {
      throw existingVendorOrgByNameError
    }

    const vendorOrganization = existingVendorOrgByEmail || existingVendorOrgByName || await OrganizationService.createOrganization({
      name: input.company_name,
      type: 'vendor',
      contact_email: input.contact_email,
      contact_phone: input.contact_phone,
      address: input.address,
    })

    const { data: existingVendor, error: existingVendorError } = await supabase
      .from('vendors')
      .select('*')
      .eq('organization_id', vendorOrganization.id)
      .maybeSingle()

    if (existingVendorError) {
      throw existingVendorError
    }

    if (existingVendor) {
      return NextResponse.json(
        { error: 'A vendor profile already exists for this organization' },
        { status: 400 }
      )
    }

    await UserProvisioningService.assertEmailAvailable(input.contact_email)

    const vendor = await VendorService.createVendor(input, vendorOrganization.id)
    const provisioned = await UserProvisioningService.provisionUser({
      fullName: input.contact_name,
      email: input.contact_email,
      role: 'vendor',
      organizationId: vendorOrganization.id,
      oneUserPerRolePerOrganization: true,
    })

    return NextResponse.json(
      {
        ...vendor,
        portal_account_created: provisioned.created,
        welcome_email_sent_to: provisioned.emailSentTo ?? null,
        welcome_email_sent: provisioned.emailSent ?? false,
        portal_account_skipped_reason: provisioned.skippedReason ?? null,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating vendor:', error)
    const rawMessage = error instanceof Error ? error.message : ''
    const status = rawMessage.includes('exists') ? 400 : 500
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to create vendor') },
      { status }
    )
  }
}
