// ============================================================================
// DISCREPANCIES API - GET ORDER EXCEPTIONS & DISCREPANCIES
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { ExceptionService } from '@/services/exception.service'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const orderId = (await params).id
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 })
    }

    // Verify user can access this order
    const { data: order } = await supabase
      .from('orders')
      .select('id, customer_id, created_by_id')
      .eq('id', orderId)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Check authorization
    // Authorization check
    const isAdmin = profile.role === 'admin'
    const isCOE = profile.role === 'coe_manager' || profile.role === 'coe_tech'
    const isOrderCreator = order.created_by_id === authUser.id
    const isCustomer = profile.role === 'customer'

    if (!isAdmin && !isCOE && !isOrderCreator && !isCustomer) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // If customer, can only see orders for their org
    if (isCustomer) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('customer_id')
        .eq('id', orderId)
        .single()

      if (orderData) {
        const { data: customer } = await supabase
          .from('customers')
          .select('organization_id')
          .eq('id', orderData.customer_id)
          .single()

        if (customer?.organization_id !== profile.organization_id) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
      }
    }

    // Get discrepancies
    const discrepancies = await ExceptionService.getOrderExceptions(orderId)

    return NextResponse.json(discrepancies)
  } catch (error) {
    console.error('Error fetching discrepancies:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch discrepancies'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
