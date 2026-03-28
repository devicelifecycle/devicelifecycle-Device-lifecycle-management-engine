// ============================================================================
// VENDOR OPEN ORDERS API - CPO orders broadcast to all vendors for bidding
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VendorService } from '@/services/vendor.service'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'vendor') {
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
