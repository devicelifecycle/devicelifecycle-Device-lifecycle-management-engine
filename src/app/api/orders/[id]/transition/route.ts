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
export const dynamic = 'force-dynamic'

type VendorShipment = {
  id: string
  direction?: string | null
  tracking_number?: string | null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
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
    const currentOrder = await OrderService.getOrderById((await params).id)
    if (!currentOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Customer can only transition their own orders, and only: submit, cancel, accept/reject quote
    if (profile.role === 'customer') {
      const customerOrg = (currentOrder.customer as { organization_id?: string } | null)?.organization_id
      if (customerOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'You can only manage your own orders' }, { status: 403 })
      }
      const customerAllowed = new Set<string>(['submitted', 'cancelled', 'accepted', 'rejected'])
      if (!customerAllowed.has(newStatus)) {
        return NextResponse.json(
          { error: 'Customers can only submit, cancel, or accept/reject quotes' },
          { status: 403 }
        )
      }
    } else if (profile.role === 'vendor') {
      const vendorOrg = (currentOrder.vendor as { organization_id?: string } | null)?.organization_id
      if (!profile.organization_id || vendorOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'You can only manage orders assigned to your organization' }, { status: 403 })
      }

      const vendorTransitionMap: Partial<Record<OrderStatus, OrderStatus[]>> = {
        accepted: ['sourcing'],
        sourcing: ['sourced'],
        sourced: ['shipped'],
        shipped: ['delivered'],
        delivered: ['closed'],
      }

      const allowedVendorTransitions = vendorTransitionMap[currentOrder.status as OrderStatus] || []
      if (!allowedVendorTransitions.includes(newStatus)) {
        return NextResponse.json(
          {
            error:
              'Vendors can only accept jobs, mark devices as sourced, shipped, delivered, or complete fulfillment on their assigned orders',
          },
          { status: 403 }
        )
      }
    } else if (!['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (newStatus === 'quoted' && !['admin', 'coe_manager', 'sales'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only admin, COE managers, or sales can send quotes' },
        { status: 403 }
      )
    }

    // Validate transition
    const canTransition = OrderService.isValidTransition(currentOrder.status as OrderStatus, newStatus)
    if (!canTransition) {
      return NextResponse.json(
        { error: `Cannot transition from ${currentOrder.status} to ${newStatus}` },
        { status: 400 }
      )
    }

    // Sourcing is only applicable to CPO orders
    if (newStatus === 'sourcing' && currentOrder.type !== 'cpo') {
      return NextResponse.json(
        { error: 'Only CPO orders can be moved to sourcing' },
        { status: 400 }
      )
    }

    // CPO: accepted → sourced only when vendor already assigned (bid was accepted during sourcing)
    if (newStatus === 'sourced' && currentOrder.status === 'accepted' && currentOrder.type === 'cpo' && !currentOrder.vendor_id) {
      return NextResponse.json(
        { error: 'Cannot move to sourced — no vendor assigned. Move to sourcing first.' },
        { status: 400 }
      )
    }

    if (newStatus === 'shipped' && currentOrder.status === 'sourced' && profile.role !== 'vendor') {
      return NextResponse.json(
        { error: 'Only vendors can move a sourced order directly to shipped' },
        { status: 400 }
      )
    }

    if (profile.role === 'vendor' && newStatus === 'shipped' && currentOrder.status === 'sourced') {
      const shipments = (((currentOrder as unknown as { shipments?: VendorShipment[] }).shipments) || [])
        .filter((shipment) => shipment.direction === 'inbound' && shipment.tracking_number)

      if (shipments.length === 0) {
        return NextResponse.json(
          { error: 'Upload vendor tracking before marking the order as shipped' },
          { status: 400 }
        )
      }
    }

    // Trade-ins can move directly from accepted to shipped_to_coe once the customer
    // has submitted the inbound shipment; CPO orders must follow their own flow.
    if (newStatus === 'shipped_to_coe' && currentOrder.status === 'accepted' && currentOrder.type !== 'trade_in') {
      return NextResponse.json(
        { error: 'Only trade-in orders can move directly to shipped to COE from accepted' },
        { status: 400 }
      )
    }

    // Split order constraints: parent can't ship/deliver/close unless all sub-orders reach that state
    if (currentOrder.is_split_order && currentOrder.sub_orders && currentOrder.sub_orders.length > 0) {
      const gateStatuses = ['shipped', 'delivered', 'closed'] as const
      if ((gateStatuses as readonly string[]).includes(newStatus)) {
        const allReady = currentOrder.sub_orders.every(sub => {
          const statusOrder = ['sourced', 'shipped', 'delivered', 'closed']
          const targetIdx = statusOrder.indexOf(newStatus)
          const subIdx = statusOrder.indexOf(sub.status)
          return subIdx >= targetIdx
        })
        if (!allReady) {
          return NextResponse.json(
            { error: `Cannot transition to "${newStatus}" — not all sub-orders have reached this status yet` },
            { status: 400 }
          )
        }
      }
    }

    // Perform transition
    const updatedOrder = await OrderService.transitionOrder(
      (await params).id,
      newStatus,
      user.id,
      notes
    )

    // Log audit
    await AuditService.logStatusChange(
      user.id,
      'order',
      (await params).id,
      currentOrder.status,
      newStatus,
      { notes, order_number: currentOrder.order_number }
    )

    // Send email + in-app notifications (fire-and-forget, don't block response)
    NotificationService.sendOrderTransitionNotifications(
      {
        id: (await params).id,
        order_number: currentOrder.order_number,
        type: currentOrder.type,
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
    const message = error instanceof Error ? error.message : 'Failed to transition order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
