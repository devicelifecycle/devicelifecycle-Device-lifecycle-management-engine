// ============================================================================
// MY VENDOR PERFORMANCE — self-service win rate, fulfillment, and bid
// comparison for the logged-in vendor. Same metrics as the admin-facing
// GET /api/vendors/[id]/performance, resolved against the caller's own
// vendor record instead of an admin-supplied id.
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ensureVendorProfileForOrganization } from '@/lib/vendor-profile'
import { computeVendorPerformance, computeBidComparison } from '@/lib/vendor-performance'

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

    const [performance, bidComparison] = await Promise.all([
      computeVendorPerformance(serviceRole, vendor.id),
      computeBidComparison(serviceRole, vendor.id),
    ])

    const decidedBids = bidComparison.length
    const avgDeltaPercent = decidedBids > 0
      ? Math.round((bidComparison.reduce((s, b) => s + (b.delta_percent ?? 0), 0) / decidedBids) * 10) / 10
      : null

    return NextResponse.json({
      ...performance,
      bid_comparison: {
        decided_bids: decidedBids,
        avg_delta_percent: avgDeltaPercent,
        points: bidComparison,
      },
    })
  } catch (error) {
    console.error('Error fetching my vendor performance:', error)
    return NextResponse.json({ error: 'Failed to fetch vendor performance' }, { status: 500 })
  }
}
