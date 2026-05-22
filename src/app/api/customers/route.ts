// ============================================================================
// CUSTOMERS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { CustomerService } from '@/services/customer.service'
import { customerSchema } from '@/lib/validations'
import { UserProvisioningService } from '@/services/user-provisioning.service'
import { safeErrorMessage } from '@/lib/utils'
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { supabase, profile } = auth

    if (['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const isInternal = ['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)
    const filters = {
      search: searchParams.get('search') || undefined,
      is_active: searchParams.get('is_active') === 'true' ? true :
                 searchParams.get('is_active') === 'false' ? false : undefined,
      organization_id: (isInternal ? searchParams.get('organization_id') || undefined : profile.organization_id) as string | undefined,
      page: Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000),
      page_size: Math.min(Math.max(parseInt(searchParams.get('page_size') || searchParams.get('limit') || '20'), 1), 100),
    }

    const result = await CustomerService.getCustomers(filters)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(`customer-create:${getClientIp(request)}`, RATE_LIMITS.api)
    if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { supabase, profile } = auth

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only admin or COE manager can create customers and customer login IDs' }, { status: 403 })
    }

    const body = await request.json()
    
    // Validate input
    const validationResult = customerSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { organization_id: requestOrgId, ...customerInput } = validationResult.data

    let orgId: string | undefined = requestOrgId

    // If no organization_id: create Organization (type customer) and link
    if (!orgId) {
      await UserProvisioningService.assertEmailAvailable(customerInput.contact_email)
      const org = await (await import('@/services/organization.service')).OrganizationService.createOrganization({
        name: customerInput.company_name,
        type: 'customer',
        contact_email: customerInput.contact_email,
        contact_phone: customerInput.contact_phone,
      })
      orgId = org.id
    } else {
      // Verify org exists and is type customer
      const { data: org } = await supabase
        .from('organizations')
        .select('id, type')
        .eq('id', orgId)
        .single()
      if (!org || org.type !== 'customer') {
        return NextResponse.json(
          { error: 'Organization must exist and be of type customer' },
          { status: 400 }
        )
      }
    }

    const { data: existingCustomers, error: existingCustomerError } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)

    if (existingCustomerError) {
      throw new Error(existingCustomerError.message)
    }

    const existingCustomerId = existingCustomers?.[0]?.id
    const customer = existingCustomerId
      ? await CustomerService.updateCustomer(existingCustomerId, customerInput)
      : await CustomerService.createCustomer(customerInput, orgId)
    const provisioned = await UserProvisioningService.provisionUser({
      fullName: customerInput.contact_name,
      email: customerInput.contact_email,
      role: 'customer',
      organizationId: orgId,
      oneUserPerRolePerOrganization: true,
    })

    return NextResponse.json(
      {
        ...customer,
        portal_account_created: provisioned.created,
        welcome_email_sent_to: provisioned.emailSentTo ?? null,
        welcome_email_sent: provisioned.emailSent ?? false,
        portal_account_skipped_reason: provisioned.skippedReason ?? null,
        customer_profile_reused: Boolean(existingCustomerId),
      },
      { status: existingCustomerId ? 200 : 201 }
    )
  } catch (error) {
    console.error('Error creating customer:', error)
    const rawMessage = error instanceof Error ? error.message : ''
    const status = rawMessage.includes('exists') || rawMessage.includes('Organization') ? 400 : 500
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to create customer') },
      { status }
    )
  }
}
