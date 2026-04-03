// ============================================================================
// SHIPMENTS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ShipmentService, isShippingConfigured } from '@/services/shipment.service'
import { ShippingProviderService } from '@/services/shipping-provider.service'
import { NotificationService } from '@/services/notification.service'
import { OrderService } from '@/services/order.service'
import type { Shipment } from '@/types'
export const dynamic = 'force-dynamic'

type CustomerShipmentOrder = {
  status?: string | null
  type?: string | null
  customer?: { organization_id?: string } | null
}


export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const direction = searchParams.get('direction') as 'inbound' | 'outbound' | null
    const orderId = searchParams.get('order_id')

    // Customers can only fetch shipments for their own orders
    if (profile.role === 'customer') {
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
    } else if (profile.role === 'vendor') {
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
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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

    // Customer can only create shipments for their own accepted orders
    if (profile.role === 'customer') {
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
    } else if (profile.role === 'vendor') {
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
      if (body.stallion_purchase === true) {
        return NextResponse.json(
          { error: 'Vendors must upload carrier tracking manually' },
          { status: 400 }
        )
      }
      if (!normalizedTrackingNumber) {
        return NextResponse.json(
          { error: 'tracking_number is required when vendors upload tracking' },
          { status: 400 }
        )
      }
    } else if (!['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const stallionPurchase = body.stallion_purchase === true
    if (!stallionPurchase && !normalizedTrackingNumber) {
      return NextResponse.json({ error: 'tracking_number is required when stallion_purchase is false' }, { status: 400 })
    }

    if (stallionPurchase && rawCarrier === 'Other') {
      return NextResponse.json(
        { error: 'Choose a supported carrier for label purchase, or enter tracking manually for a custom platform' },
        { status: 400 }
      )
    }

    if (stallionPurchase && !isShippingConfigured()) {
      return NextResponse.json(
        { error: 'Label purchase service is not configured. Enter tracking manually or set STALLION_API_TOKEN.' },
        { status: 503 }
      )
    }

    const advanceTradeInToInboundTransit = async () => {
      if (profile.role !== 'customer') return
      if (body.direction !== 'inbound') return
      const currentCustomerOrder = customerOrder
      if (!currentCustomerOrder) return
      if (currentCustomerOrder.type !== 'trade_in' || currentCustomerOrder.status !== 'accepted') return

      await OrderService.transitionOrder(
        body.order_id,
        'shipped_to_coe',
        user.id,
        'Customer submitted inbound shipment',
      )
    }

    const shipment = await ShipmentService.createShipment({
      ...body,
      carrier: resolvedCarrier,
      tracking_number: normalizedTrackingNumber || (stallionPurchase ? `STALLION-PENDING-${Date.now()}` : normalizedTrackingNumber),
      created_by_id: user.id,
    })

    let responsePayload: Shipment | (Shipment & { provider: string }) = shipment

    if (stallionPurchase) {
      try {
        const purchased = await ShippingProviderService.purchaseLabel({
          fromAddress: body.from_address,
          toAddress: body.to_address,
          preferredCarrier: body.carrier,
          preferredServiceLevelToken: body.preferred_service_level_token,
          parcel: {
            length: body.dimensions?.length || 12,
            width: body.dimensions?.width || 8,
            height: body.dimensions?.height || 4,
            distanceUnit: 'in',
            weight: body.weight || 2,
            massUnit: 'lb',
          },
        })

        const updatedShipment = await ShipmentService.attachLabelPurchase(shipment.id, {
          stallion_shipment_id: purchased.stallion_shipment_id,
          tracking_number: purchased.tracking_number,
          carrier: purchased.carrier,
          tracking_status: purchased.tracking_status,
          label_url: purchased.label_url,
          label_pdf_url: purchased.label_pdf_url,
          rate_amount: purchased.rate_amount,
          rate_currency: purchased.rate_currency,
          estimated_delivery: purchased.estimated_delivery,
          raw_response: purchased.stallion_raw,
          purchased_by_id: user.id,
        })

        responsePayload = { ...updatedShipment, provider: 'shipping_provider' }
      } catch (error) {
        // Label purchase failed — delete the pending shipment record
        const svcClient = createServiceRoleClient()
        await svcClient.from('shipments').delete().eq('id', shipment.id)
        const msg = error instanceof Error ? error.message : 'Label purchase failed'
        return NextResponse.json(
          { error: `Label purchase failed: ${msg}. Turn off label purchase and enter a tracking number manually.` },
          { status: 400 }
        )
      }
    }

    await advanceTradeInToInboundTransit()

    // Notify admins when a customer submits shipment details (fire-and-forget)
    if (profile.role === 'customer') {
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
