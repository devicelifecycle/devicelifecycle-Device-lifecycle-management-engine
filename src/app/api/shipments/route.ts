// ============================================================================
// SHIPMENTS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ShipmentService, isShippingConfigured } from '@/services/shipment.service'
import { StallionService } from '@/services/stallion.service'
import { NotificationService } from '@/services/notification.service'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
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
    const supabase = createServerSupabaseClient()
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

    // Basic validation
    if (!body.order_id || typeof body.order_id !== 'string') {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 })
    }

    // Customer can only create shipments for their own accepted orders
    if (profile.role === 'customer') {
      const { data: order } = await supabase
        .from('orders')
        .select('status, customer_id, customer:customers(organization_id)')
        .eq('id', body.order_id)
        .single()
      const custOrg = (order?.customer as { organization_id?: string } | null)?.organization_id
      if (!order || custOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'You can only create shipments for your own orders' }, { status: 403 })
      }
      if (order.status !== 'accepted') {
        return NextResponse.json({ error: 'You can only ship devices after accepting the quote' }, { status: 400 })
      }
    } else if (!['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const stallionPurchase = body.stallion_purchase === true
    if (!stallionPurchase && (!body.tracking_number || typeof body.tracking_number !== 'string')) {
      return NextResponse.json({ error: 'tracking_number is required when stallion_purchase is false' }, { status: 400 })
    }

    if (stallionPurchase && !isShippingConfigured()) {
      return NextResponse.json(
        { error: 'Stallion Express is not configured. Set STALLION_API_TOKEN in environment.' },
        { status: 503 }
      )
    }

    const shipment = await ShipmentService.createShipment({
      ...body,
      tracking_number: body.tracking_number || (stallionPurchase ? `STALLION-PENDING-${Date.now()}` : body.tracking_number),
      created_by_id: user.id,
    })

    if (stallionPurchase) {
      try {
        const purchased = await StallionService.purchaseLabel({
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

        return NextResponse.json({ ...updatedShipment, provider: 'stallion' }, { status: 201 })
      } catch (error) {
        // Label purchase failed — delete the pending shipment record
        const svcClient = createServiceRoleClient()
        await svcClient.from('shipments').delete().eq('id', shipment.id)
        const msg = error instanceof Error ? error.message : 'Label purchase failed'
        return NextResponse.json(
          { error: `Stallion label purchase failed: ${msg}. Try turning off "Purchase shipping label" and entering a tracking number manually.` },
          { status: 400 }
        )
      }
    }

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
            message: `Customer has shipped devices for order #${orderNumber} via ${body.carrier}. Tracking: ${body.tracking_number}`,
            link: `/orders/${body.order_id}`,
            metadata: { order_id: body.order_id, tracking_number: body.tracking_number, carrier: body.carrier, audience: 'admin' },
          }).catch(() => {})
        }
      })().catch(err => console.error('Customer shipment notification error:', err))
    }

    return NextResponse.json(shipment, { status: 201 })
  } catch (error) {
    console.error('Error creating shipment:', error)
    return NextResponse.json({ error: 'Failed to create shipment' }, { status: 500 })
  }
}
