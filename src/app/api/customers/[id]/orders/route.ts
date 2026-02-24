// ============================================================================
// CUSTOMER ORDERS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CustomerService } from '@/services/customer.service'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20'), 1), 100)

    const orders = await CustomerService.getCustomerOrders(params.id, limit)
    return NextResponse.json({ data: orders })
  } catch (error) {
    console.error('Error fetching customer orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer orders' },
      { status: 500 }
    )
  }
}
