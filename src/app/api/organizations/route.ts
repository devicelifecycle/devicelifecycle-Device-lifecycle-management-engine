// ============================================================================
// ORGANIZATIONS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrganizationService } from '@/services/organization.service'
import { CustomerService } from '@/services/customer.service'
import { VendorService } from '@/services/vendor.service'
import { createOrganizationSchema } from '@/lib/validations'
import { UserProvisioningService } from '@/services/user-provisioning.service'
import type { OrganizationType } from '@/types'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user role and org for access control
    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    // Customer/vendor can only see their own organization
    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      if (!profile.organization_id) {
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
    return NextResponse.json(result)
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
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

    if ((validationResult.data.type === 'customer' || validationResult.data.type === 'vendor') && email) {
      await UserProvisioningService.assertEmailAvailable(email)
    }

    const organization = await OrganizationService.createOrganization({
      ...rest,
      address: { street: address, city, state, zip_code, country },
      contact_email: email,
      contact_phone: phone,
    })

    // When type is 'customer', create linked Customer record for orders
    if (organization.type === 'customer') {
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

    if (organization.type === 'vendor') {
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
            country: String((organization.address as { country?: string }).country || 'USA'),
          },
        },
        organization.id
      )
    }

    const shouldProvisionPortalUser = organization.type === 'customer' || organization.type === 'vendor'
    const provisioned = shouldProvisionPortalUser
      ? await UserProvisioningService.provisionUser({
          fullName: organization.name,
          email: organization.contact_email!,
          role: organization.type === 'customer' ? 'customer' : 'vendor',
          organizationId: organization.id,
          oneUserPerRolePerOrganization: true,
        })
      : null

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
