// ============================================================================
// VENDOR BIDS API ROUTE
// GET — Fetch vendor bids for an order
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VendorService } from '@/services/vendor.service'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only internal roles can view vendor bids
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('order_id')

    if (!orderId) {
      return NextResponse.json({ error: 'order_id query parameter is required' }, { status: 400 })
    }

    const bids = await VendorService.getOrderVendorBids(orderId)

    return NextResponse.json({ data: bids })
  } catch (error) {
    console.error('Error fetching vendor bids:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendor bids' },
      { status: 500 }
    )
  }
}
