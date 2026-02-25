// ============================================================================
// ORDER TRANSITION API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrderService } from '@/services/order.service'
import { AuditService } from '@/services/audit.service'
import { NotificationService } from '@/services/notification.service'
import { orderTransitionSchema } from '@/lib/validations'
import type { OrderStatus } from '@/types'

interface RouteParams {
  params: {
    id: string
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only internal roles can transition orders
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = orderTransitionSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { to_status: newStatus, notes } = validationResult.data

    // Get current order
    const currentOrder = await OrderService.getOrderById(params.id)
    if (!currentOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Validate transition
    const canTransition = OrderService.isValidTransition(currentOrder.status as OrderStatus, newStatus)
    if (!canTransition) {
      return NextResponse.json(
        { error: `Cannot transition from ${currentOrder.status} to ${newStatus}` },
        { status: 400 }
      )
    }

    // Perform transition
    const updatedOrder = await OrderService.transitionOrder(
      params.id,
      newStatus,
      user.id,
      notes
    )

    // Log audit
    await AuditService.logStatusChange(
      user.id,
      'order',
      params.id,
      currentOrder.status,
      newStatus,
      { notes, order_number: currentOrder.order_number }
    )

    // Send email + in-app notifications (fire-and-forget, don't block response)
    NotificationService.sendOrderTransitionNotifications(
      {
        id: params.id,
        order_number: currentOrder.order_number,
        customer_id: currentOrder.customer_id,
        vendor_id: currentOrder.vendor_id,
        assigned_to_id: currentOrder.assigned_to_id,
        created_by_id: currentOrder.created_by_id,
      },
      currentOrder.status,
      newStatus
    ).catch(err => console.error('Notification error:', err))

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Error transitioning order:', error)
    return NextResponse.json(
      { error: 'Failed to transition order' },
      { status: 500 }
    )
  }
}
