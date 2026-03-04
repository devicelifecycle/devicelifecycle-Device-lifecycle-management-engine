// ============================================================================
// SHIPMENTS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ShipmentService } from '@/services/shipment.service'
import { ShippoService } from '@/services/shippo.service'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const direction = searchParams.get('direction') as 'inbound' | 'outbound' | null
    const orderId = searchParams.get('order_id')

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
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    // Basic validation
    if (!body.order_id || typeof body.order_id !== 'string') {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 })
    }

    const shippoPurchase = body.shippo_purchase === true
    if (!shippoPurchase && (!body.tracking_number || typeof body.tracking_number !== 'string')) {
      return NextResponse.json({ error: 'tracking_number is required when shippo_purchase is false' }, { status: 400 })
    }

    if (shippoPurchase && body.direction !== 'outbound') {
      return NextResponse.json({ error: 'Shippo purchase is only supported for outbound shipments' }, { status: 400 })
    }

    const shipment = await ShipmentService.createShipment({
      ...body,
      tracking_number: body.tracking_number || (shippoPurchase ? `SHIPPO-PENDING-${Date.now()}` : body.tracking_number),
      created_by_id: user.id,
    })

    if (shippoPurchase) {
      try {
        const purchased = await ShippoService.purchaseLabel({
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

        const updatedShipment = await ShipmentService.attachShippoPurchase(shipment.id, {
          ...purchased,
          purchased_by_id: user.id,
        })

        return NextResponse.json(updatedShipment, { status: 201 })
      } catch (error) {
        await supabase.from('shipments').delete().eq('id', shipment.id)
        throw error
      }
    }

    return NextResponse.json(shipment, { status: 201 })
  } catch (error) {
    console.error('Error creating shipment:', error)
    return NextResponse.json({ error: 'Failed to create shipment' }, { status: 500 })
  }
}
