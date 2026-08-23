// ============================================================================
// ORDER TRANSITION API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { OrderService } from '@/services/order.service'
import { AuditService } from '@/services/audit.service'
import { NotificationService } from '@/services/notification.service'
import { EmailService } from '@/services/email.service'
import { orderTransitionSchema } from '@/lib/validations'
import type { OrderStatus } from '@/types'
export const dynamic = 'force-dynamic'

type VendorShipment = {
  id: string
  direction?: string | null
  tracking_number?: string | null
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return POST(request, { params })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (profile.is_active === false) {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = orderTransitionSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { to_status: newStatus, notes, validity_days } = validationResult.data

    // Get current order
    const currentOrder = await OrderService.getOrderById((await params).id)
    if (!currentOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Customer can only transition their own orders, and only: submit, cancel, accept/reject quote,
    // or approve mismatch review (moves mismatch_review → payment_processing)
    if (effectiveRole === 'customer') {
      const customerOrg = (currentOrder.customer as { organization_id?: string } | null)?.organization_id
      if (customerOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'You can only manage your own orders' }, { status: 403 })
      }
      const customerAllowed = new Set<string>(['submitted', 'cancelled', 'accepted', 'rejected', 'payment_processing'])
      if (!customerAllowed.has(newStatus)) {
        return NextResponse.json(
          { error: 'Customers can only submit, cancel, accept/reject quotes, or approve a mismatch review' },
          { status: 403 }
        )
      }
      // Customer can only move to payment_processing from mismatch_review
      if (newStatus === 'payment_processing' && currentOrder.status !== 'mismatch_review') {
        return NextResponse.json(
          { error: 'Payment processing can only be triggered from mismatch review' },
          { status: 403 }
        )
      }
    } else if (effectiveRole === 'vendor') {
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

    // mismatch_review and payment_processing are triggered by admin/coe_manager only
    // (exception: customer can approve mismatch_review → payment_processing, handled above)
    if (newStatus === 'mismatch_review' && !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only admin or COE managers can flag a mismatch review' },
        { status: 403 }
      )
    }
    if (newStatus === 'payment_processing' && effectiveRole !== 'customer' && !['admin', 'coe_manager', 'sales'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only admin, COE managers, or sales can initiate payment processing' },
        { status: 403 }
      )
    }
    if (newStatus === 'payment_sent' && !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only admin or COE managers can mark payment as sent' },
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

    if (newStatus === 'shipped' && currentOrder.status === 'sourced' && effectiveRole !== 'vendor') {
      return NextResponse.json(
        { error: 'Only vendors can move a sourced order directly to shipped' },
        { status: 400 }
      )
    }

    if (effectiveRole === 'vendor' && newStatus === 'shipped' && currentOrder.status === 'sourced') {
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
      authUser.id,
      notes,
      validity_days
    )

    // Log audit
    await AuditService.logStatusChange(
      authUser.id,
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

    // When a CPO order moves from draft → submitted it becomes open for vendor bidding.
    // Broadcast to all active vendors so they know to log in and submit a bid.
    if (currentOrder.type === 'cpo' && currentOrder.status === 'draft' && newStatus === 'submitted') {
      const orderId = (await params).id
      ;(async () => {
        const { resolveTenantBrandLabel } = await import('@/lib/tenant-brand-label')
        const brand = await resolveTenantBrandLabel((currentOrder as { tenant_id?: string | null }).tenant_id ?? null, createServiceRoleClient())
        const svc = createServiceRoleClient()
        const { data: vendors } = await svc
          .from('vendors')
          .select('id, company_name, contact_email, contact_name, contact_phone, organization_id')
          .eq('is_active', true)
        const orderLink = `/vendor/orders`
        const title = `New CPO Order Available — #${currentOrder.order_number}`
        const message = `A new CPO order #${currentOrder.order_number} is open for bidding. Log in to review the order and submit your bid.`

        // Batch: single query for all vendor org users instead of N per-org queries
        const vendorOrgIds = (vendors || []).map(v => v.organization_id).filter(Boolean) as string[]
        const { data: allVendorUsers } = vendorOrgIds.length
          ? await svc.from('users').select('id').in('organization_id', vendorOrgIds).eq('is_active', true)
          : { data: [] }

        await Promise.all([
          ...(allVendorUsers || []).map(vu =>
            NotificationService.createNotification({
              user_id: vu.id,
              type: 'in_app',
              title,
              message,
              link: orderLink,
              metadata: { order_id: orderId, order_number: currentOrder.order_number, event: 'cpo_order_created' },
            }).catch(() => {})
          ),
          ...(vendors || []).flatMap(vendor => [
            vendor.contact_email
              ? EmailService.sendOrderStatusEmail({
                  to: vendor.contact_email,
                  recipientName: vendor.contact_name || vendor.company_name || 'Vendor',
                  orderNumber: currentOrder.order_number,
                  orderId,
                  fromStatus: 'draft',
                  toStatus: 'submitted',
                  subject: title,
                  message,
                  tenantId: (currentOrder as { tenant_id?: string | null }).tenant_id ?? null,
                }).catch(() => {})
              : null,
            vendor.contact_phone && EmailService.isTwilioConfigured()
              ? EmailService.sendSMS(
                  vendor.contact_phone,
                  `[${brand.name}] New CPO Order #${currentOrder.order_number} is open for bidding. Log in to submit your bid.`.slice(0, 160)
                ).catch(() => {})
              : null,
          ]).filter(Boolean),
        ])
      })().catch(err => console.error('Vendor CPO bid notification error:', err))
    }

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Error transitioning order:', error)
    const message = error instanceof Error ? error.message : 'Failed to transition order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
