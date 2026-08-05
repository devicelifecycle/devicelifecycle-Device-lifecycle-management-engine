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
import { tenantLimits } from '@/lib/tenant-limits'
import { quotaBlockMessage } from '@/lib/quota'
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
      page_size: Math.min(Math.max(parseInt(searchParams.get('page_size') || searchParams.get('limit') || '20'), 1), 500),
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

    // If no organization_id: reuse an existing org by name/email regardless
    // of its current type — a company that already exists as a vendor org
    // should become dual-role (gain a customers row too), not get a second,
    // duplicate organization row with the same name. Only create fresh when
    // nothing matches. Email reuse across orgs is allowed for the contact
    // record itself — only portal login provisioning (below) needs a unique
    // email, and that's handled gracefully so it never blocks creating the record.
    if (!orgId) {
      const [
        { data: existingOrgByEmail, error: existingOrgByEmailError },
        { data: existingOrgByName, error: existingOrgByNameError },
      ] = await Promise.all([
        supabase.from('organizations').select('id').eq('contact_email', customerInput.contact_email).maybeSingle(),
        supabase.from('organizations').select('id').eq('name', customerInput.company_name).maybeSingle(),
      ])
      if (existingOrgByEmailError) throw existingOrgByEmailError
      if (existingOrgByNameError) throw existingOrgByNameError

      orgId = existingOrgByEmail?.id || existingOrgByName?.id
      if (!orgId) {
        const org = await (await import('@/services/organization.service')).OrganizationService.createOrganization({
          name: customerInput.company_name,
          type: 'customer',
          contact_email: customerInput.contact_email,
          contact_phone: customerInput.contact_phone,
        })
        orgId = org.id
      }
    } else {
      // Verify the org exists — any type is fine; an org gaining a customers
      // row is exactly how it becomes dual-role.
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', orgId)
        .single()
      if (!org) {
        return NextResponse.json(
          { error: 'Organization not found' },
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

    // Per-tenant customer quota — only for NEW customers, only when a finite
    // limit is set (unlimited/platform tenant skips the count entirely), and
    // fails open on any lookup error so it can never wrongly block a create.
    if (!existingCustomerId && auth.tenantId) {
      try {
        const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', auth.tenantId).maybeSingle()
        const { license } = tenantLimits(tenant?.settings)
        if (license.customers >= 0) {
          const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', auth.tenantId)
          const blocked = quotaBlockMessage(license.customers, count ?? 0, 1, 'Customers')
          if (blocked) return NextResponse.json({ error: blocked }, { status: 403 })
        }
      } catch { /* fail open — never block on a quota lookup error */ }
    }

    const customer = existingCustomerId
      ? await CustomerService.updateCustomer(existingCustomerId, customerInput)
      : await CustomerService.createCustomer(customerInput, orgId)

    // Portal login provisioning is best-effort: if this email already has a
    // login elsewhere (Supabase Auth requires globally unique emails), the
    // customer contact record is still saved — it just won't get its own
    // portal account under this organization.
    let provisioned: { created: boolean; emailSentTo?: string | null; emailSent?: boolean; skippedReason?: string | null }
    try {
      provisioned = await UserProvisioningService.provisionUser({
        fullName: customerInput.contact_name,
        email: customerInput.contact_email,
        role: 'customer',
        organizationId: orgId,
        oneUserPerRolePerOrganization: true,
      })
    } catch (provisionError) {
      provisioned = {
        created: false,
        skippedReason: provisionError instanceof Error ? provisionError.message : 'Portal login could not be created',
      }
    }

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
