// ============================================================================
// VENDOR OPEN ORDERS API - CPO orders broadcast to all vendors for bidding
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { VendorService } from '@/services/vendor.service'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    if (auth.effectiveRole !== 'vendor') {
      return NextResponse.json({ error: 'Only vendors can view open orders' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 100)
    const page_size = Math.min(Math.max(parseInt(searchParams.get('page_size') || '20'), 1), 100)

    const result = await VendorService.getOpenOrdersForBidding({ page, page_size })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching open orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch open orders' },
      { status: 500 }
    )
  }
}
