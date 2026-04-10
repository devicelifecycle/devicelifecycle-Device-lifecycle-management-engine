// ============================================================================
// MY CUSTOMER API ROUTE
// Returns the customer record for the logged-in user's organization.
// For customer role only — used when creating orders so they don't need to select a customer.
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ensureCustomerProfileForOrganization } from '@/lib/customer-profile'

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
    const customer = await ensureCustomerProfileForOrganization(
      serviceRole,
      profile.organization_id,
      profile,
    )

    return NextResponse.json(customer)
  } catch (error) {
    console.error('Error fetching my customer:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer' },
      { status: 500 }
    )
  }
}
