// ============================================================================
// SHIPMENTS API ROUTE
// ============================================================================

import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ShipmentService } from '@/services/shipment.service'
import { NotificationService } from '@/services/notification.service'
import { OrderService } from '@/services/order.service'
import { delegationLevel, customerInVarScope } from '@/lib/delegation'
import type { Shipment } from '@/types'
export const dynamic = 'force-dynamic'

type CustomerShipmentOrder = {
  status?: string | null
  type?: string | null
  customer?: { organization_id?: string } | null
}


export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const { searchParams } = new URL(request.url)
    const direction = searchParams.get('direction') as 'inbound' | 'outbound' | null
    const orderId = searchParams.get('order_id')

    // Customers can only fetch shipments for their own orders
    if (effectiveRole === 'customer') {
      if (!orderId) {
        return NextResponse.json({ error: 'Customers must specify order_id' }, { status: 403 })
      }
      // Verify the order belongs to this customer's org
      const { data: order } = await supabase
        .from('orders')
        .select('customer_id, customer:customers(organization_id)')
        .eq('id', orderId)
        .single()
      const custOrg = (order?.customer as { organization_id?: string } | null)?.organization_id
      if (!order || custOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'You can only view shipments for your own orders' }, { status: 403 })
      }
    } else if (effectiveRole === 'vendor') {
      if (!orderId) {
        return NextResponse.json({ error: 'Vendors must specify order_id' }, { status: 403 })
      }
      const { data: order } = await supabase
        .from('orders')
        .select('vendor:vendors(organization_id)')
        .eq('id', orderId)
        .single()
      const vendorOrg = (order?.vendor as { organization_id?: string } | null)?.organization_id
      if (!order || vendorOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'You can only view shipments for your own assigned orders' }, { status: 403 })
      }
    } else if (!['admin', 'coe_manager', 'coe_tech', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let shipments
    if (orderId) {
      // Get shipments for a specific order
      shipments = await ShipmentService.getShipmentsByOrderId(orderId)
    } else if (direction === 'inbound') {
      shipments = await ShipmentService.getPendingInboundShipments()
    } else if (direction === 'outbound') {
      shipments = await ShipmentService.getPendingOutboundShipments()
    } else {
      // Get all shipments
      const { data, error } = await supabase
        .from('shipments')
        .select('*, order:orders(order_number, type, status)')
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) throw error
      shipments = data
    }

    return NextResponse.json({ data: shipments })
  } catch (error) {
    console.error('Error fetching shipments:', error)
    return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const body = await request.json()
    const rawCarrier = typeof body.carrier === 'string' ? body.carrier.trim() : ''
    const rawCustomCarrier = typeof body.custom_carrier === 'string' ? body.custom_carrier.trim() : ''
    const resolvedCarrier = rawCarrier === 'Other' ? rawCustomCarrier : rawCarrier
    const normalizedTrackingNumber = typeof body.tracking_number === 'string' ? body.tracking_number.trim() : ''

    // Basic validation
    if (!body.order_id || typeof body.order_id !== 'string') {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 })
    }

    if (!rawCarrier) {
      return NextResponse.json({ error: 'carrier is required' }, { status: 400 })
    }

    if (rawCarrier === 'Other' && !rawCustomCarrier) {
      return NextResponse.json(
        { error: 'custom_carrier is required when carrier is Other' },
        { status: 400 }
      )
    }

    let customerOrder: CustomerShipmentOrder | null = null
    const isVarStaff = delegationLevel(effectiveRole) !== 'none'

    // Customer can only create shipments for their own accepted orders
    if (effectiveRole === 'customer') {
      const { data: order } = await supabase
        .from('orders')
        .select('status, type, customer_id, customer:customers(organization_id)')
        .eq('id', body.order_id)
        .single()
      customerOrder = order as CustomerShipmentOrder | null
      const custOrg = (order?.customer as { organization_id?: string } | null)?.organization_id
      if (!order || custOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'You can only create shipments for your own orders' }, { status: 403 })
      }
      if (order.status !== 'accepted') {
        return NextResponse.json({ error: 'You can only ship devices after accepting the quote' }, { status: 400 })
      }
    } else if (isVarStaff) {
      // VAR staff record the customer's ship-in on their behalf (most VAR end
      // customers never log in) — same rules as the customer path: their own
      // customer (delegation scope), an accepted trade-in, inbound, tracked.
      const { data: order } = await createServiceRoleClient()
        .from('orders')
        .select('status, type, customer_id, customer:customers(tenant_id, region, assigned_rep_id)')
        .eq('id', body.order_id)
        .maybeSingle()
      const cust = (Array.isArray(order?.customer) ? order?.customer[0] : order?.customer) as { tenant_id?: string; region?: string; assigned_rep_id?: string } | null
      if (!order || !customerInVarScope({ role: effectiveRole, userId: profile.id, region: profile.region ?? null, tenantId: auth.tenantId }, cust)) {
        return NextResponse.json({ error: 'You can only record shipments for your own customers' }, { status: 403 })
      }
      if (order.type !== 'trade_in' || order.status !== 'accepted') {
        return NextResponse.json({ error: 'Ship-in can be recorded once the trade-in quote is accepted' }, { status: 400 })
      }
      if ((body.direction ?? 'inbound') !== 'inbound') {
        return NextResponse.json({ error: 'VAR staff can only record the inbound shipment to the COE' }, { status: 400 })
      }
      body.direction = 'inbound'
      if (!normalizedTrackingNumber) return NextResponse.json({ error: 'tracking_number is required' }, { status: 400 })
      customerOrder = order as CustomerShipmentOrder
    } else if (effectiveRole === 'vendor') {
      const { data: order } = await supabase
        .from('orders')
        .select('status, vendor:vendors(organization_id)')
        .eq('id', body.order_id)
        .single()
      const vendorOrg = (order?.vendor as { organization_id?: string } | null)?.organization_id
      if (!order || vendorOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'You can only create shipments for your own assigned orders' }, { status: 403 })
      }
      if (!['sourced', 'shipped'].includes(order.status || '')) {
        return NextResponse.json(
          { error: 'You can only upload vendor tracking after the order has been sourced' },
          { status: 400 }
        )
      }
      if (!body.direction) {
        body.direction = 'inbound'
      }
      if (body.direction && body.direction !== 'inbound') {
        return NextResponse.json(
          { error: 'Vendor shipments must be inbound to COE' },
          { status: 400 }
        )
      }
      if (!normalizedTrackingNumber) {
        return NextResponse.json(
          { error: 'tracking_number is required' },
          { status: 400 }
        )
      }
    } else if (!['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!normalizedTrackingNumber) {
      return NextResponse.json({ error: 'tracking_number is required' }, { status: 400 })
    }

    const advanceTradeInToInboundTransit = async () => {
      if (effectiveRole !== 'customer' && !isVarStaff) return
      if (body.direction !== 'inbound') return
      const currentCustomerOrder = customerOrder
      if (!currentCustomerOrder) return
      if (currentCustomerOrder.type !== 'trade_in' || currentCustomerOrder.status !== 'accepted') return

      await OrderService.transitionOrder(
        body.order_id,
        'shipped_to_coe',
        authUser.id,
        isVarStaff ? 'Reseller recorded the customer’s inbound shipment' : 'Customer submitted inbound shipment',
      )
    }

    const shipment = await ShipmentService.createShipment({
      ...body,
      // NOT NULL columns. The COE Shipping page sends no addresses, so every
      // outbound shipment created there failed with a 500; {} matches what the
      // customer ship-in form already sends when it has no address.
      from_address: body.from_address ?? {},
      to_address: body.to_address ?? {},
      carrier: resolvedCarrier,
      tracking_number: normalizedTrackingNumber,
      created_by_id: authUser.id,
    })

    // Email + SMS the customer that a shipment was created, with tracking —
    // deferred via after() so the runtime keeps the function alive for it past
    // the response (a bare `void` can get frozen mid-flight on Vercel).
    // Subsequent status changes email them too (PATCH route).
    after(() => ShipmentService.notifyCustomerOfShipmentStatus(shipment.id))

    const responsePayload: Shipment = shipment

    await advanceTradeInToInboundTransit()

    // Notify admins when a customer (or their reseller) submits shipment details (fire-and-forget)
    if (effectiveRole === 'customer' || isVarStaff) {
      ;(async () => {
        const svc = createServiceRoleClient()
        const { data: order } = await svc.from('orders').select('order_number').eq('id', body.order_id).single()
        const orderNumber = order?.order_number || body.order_id
        const { data: admins } = await svc.from('users').select('id').eq('role', 'admin').eq('is_active', true)
        for (const admin of admins || []) {
          await NotificationService.createNotification({
            user_id: admin.id,
            type: 'in_app',
            title: `Customer Shipped Devices — Order #${orderNumber}`,
            message: `Customer has shipped devices for order #${orderNumber} via ${resolvedCarrier}. Tracking: ${normalizedTrackingNumber}`,
            link: `/orders/${body.order_id}`,
            metadata: { order_id: body.order_id, tracking_number: normalizedTrackingNumber, carrier: resolvedCarrier, audience: 'admin' },
          }).catch(() => {})
        }
      })().catch(err => console.error('Customer shipment notification error:', err))
    }

    return NextResponse.json(responsePayload, { status: 201 })
  } catch (error) {
    console.error('Error creating shipment:', error)
    return NextResponse.json({ error: 'Failed to create shipment' }, { status: 500 })
  }
}
