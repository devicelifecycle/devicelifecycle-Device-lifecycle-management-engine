// ============================================================================
// MY VENDOR PAYOUTS — self-service payout status for the logged-in vendor.
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ensureVendorProfileForOrganization } from '@/lib/vendor-profile'
import { computeVendorPayouts } from '@/lib/vendor-payouts'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (effectiveRole !== 'vendor') {
      return NextResponse.json({ error: 'Forbidden — vendor role required' }, { status: 403 })
    }
    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with this account' }, { status: 400 })
    }

    const serviceRole = createServiceRoleClient()
    const { data: userDetails } = await supabase
      .from('users')
      .select('full_name, email, notification_email, phone')
      .eq('id', authUser.id)
      .single()

    const vendor = await ensureVendorProfileForOrganization(serviceRole, profile.organization_id, userDetails ?? {})
    const payouts = await computeVendorPayouts(serviceRole, vendor.id)

    return NextResponse.json(payouts)
  } catch (error) {
    console.error('Error fetching my vendor payouts:', error)
    return NextResponse.json({ error: 'Failed to fetch vendor payouts' }, { status: 500 })
  }
}
