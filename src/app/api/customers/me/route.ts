// ============================================================================
// MY CUSTOMER API ROUTE
// Returns the customer record for the logged-in user's organization.
// Accessible to users whose effective role is 'customer' (primary or secondary).
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ensureCustomerProfileForOrganization } from '@/lib/customer-profile'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { effectiveRole, profile, supabase } = auth

    if (effectiveRole !== 'customer') {
      return NextResponse.json({ error: 'Forbidden — customer role required' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json(
        { error: 'No organization associated with this account' },
        { status: 400 }
      )
    }

    const { data: userDetails } = await supabase
      .from('users')
      .select('full_name, email, notification_email, phone')
      .eq('id', profile.id)
      .single()

    const serviceRole = createServiceRoleClient()
    const customer = await ensureCustomerProfileForOrganization(
      serviceRole,
      profile.organization_id,
      userDetails ?? {},
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
