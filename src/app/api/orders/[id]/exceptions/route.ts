// ============================================================================
// ORDER EXCEPTIONS API — Pending condition mismatches for customer approval
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { TriageService } from '@/services/triage.service'
import { OrderService } from '@/services/order.service'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { id: string }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const order = await OrderService.getOrderById(params.id)
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Customer: only their org's orders
    if (profile.role === 'customer') {
      const orderCustomerOrg = (order.customer as { organization_id?: string })?.organization_id
      if (orderCustomerOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Internal roles: admin, coe_manager, coe_tech, sales
    if (!['admin', 'coe_manager', 'coe_tech', 'sales', 'customer'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const exceptions = await TriageService.getPendingExceptionsForOrder(params.id)
    return NextResponse.json({ data: exceptions })
  } catch (error) {
    console.error('Error fetching order exceptions:', error)
    return NextResponse.json({ error: 'Failed to fetch exceptions' }, { status: 500 })
  }
}
