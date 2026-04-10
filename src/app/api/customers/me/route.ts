// ============================================================================
// MY CUSTOMER API ROUTE
// Returns the customer record for the logged-in user's organization.
// For customer role only — used when creating orders so they don't need to select a customer.
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id, full_name, email, notification_email, phone')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'customer') {
      return NextResponse.json({ error: 'Forbidden — customer role required' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json(
        { error: 'No organization associated with this account' },
        { status: 400 }
      )
    }

    const serviceRole = createServiceRoleClient()
    const { data: existingCustomers, error: existingCustomerError } = await serviceRole
      .from('customers')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)

    if (existingCustomerError) {
      throw existingCustomerError
    }

    const existingCustomer = existingCustomers?.[0]
    if (existingCustomer) {
      return NextResponse.json(existingCustomer)
    }

    const { data: organization, error: organizationError } = await serviceRole
      .from('organizations')
      .select('name, contact_email, contact_phone, address')
      .eq('id', profile.organization_id)
      .single()

    if (organizationError || !organization) {
      return NextResponse.json(
        { error: 'No customer profile found for your organization. Please contact support.' },
        { status: 404 }
      )
    }

    const fallbackEmail =
      organization.contact_email ||
      profile.notification_email ||
      (typeof profile.email === 'string' && !profile.email.endsWith('@login.local') ? profile.email : null) ||
      `contact+${profile.organization_id}@dlm.local`

    const { data: createdCustomer, error: createError } = await serviceRole
      .from('customers')
      .insert({
        organization_id: profile.organization_id,
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

    return NextResponse.json(createdCustomer)
  } catch (error) {
    console.error('Error fetching my customer:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer' },
      { status: 500 }
    )
  }
}
