// ============================================================================
// VENDOR PERFORMANCE API ROUTE
// Returns bid and fulfillment metrics for a single vendor.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { computeVendorPerformance } from '@/lib/vendor-performance'
import { isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: 'Invalid vendor ID' }, { status: 400 })
    }

    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { profile } = auth

    if (!['admin', 'coe_manager', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const service = createServiceRoleClient()
    const performance = await computeVendorPerformance(service, id)

    return NextResponse.json(performance)
  } catch (error) {
    console.error('Error fetching vendor performance:', error)
    return NextResponse.json({ error: 'Failed to fetch vendor performance' }, { status: 500 })
  }
}
