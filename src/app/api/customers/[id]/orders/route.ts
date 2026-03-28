// ============================================================================
// CUSTOMER ORDERS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CustomerService } from '@/services/customer.service'
export const dynamic = 'force-dynamic'


const INTERNAL_ROLES = ['admin', 'coe_manager', 'coe_tech', 'sales']

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

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    const customer = await CustomerService.getCustomerById(params.id)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    if (profile?.role === 'vendor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!INTERNAL_ROLES.includes(profile?.role || '')) {
      if (profile?.organization_id !== customer.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
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
