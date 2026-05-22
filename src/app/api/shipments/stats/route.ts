// ============================================================================
// SHIPPING STATS API ROUTE (for Reports page)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { ShipmentService } from '@/services/shipment.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const stats = await ShipmentService.getShippingStats()
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error fetching shipping stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
