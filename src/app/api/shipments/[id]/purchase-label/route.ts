import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/utils'
import { ShipmentService, isShippingConfigured } from '@/services/shipment.service'
import { StallionService } from '@/services/stallion.service'
import type { AddressInput } from '@/services/shipment.service'
export const dynamic = 'force-dynamic'


export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    if (!isShippingConfigured()) {
      return NextResponse.json(
        { error: 'Stallion Express is not configured. Set STALLION_API_TOKEN in environment.' },
        { status: 503 }
      )
    }

    const shipment = await ShipmentService.getShipmentById(params.id)
    if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    if (shipment.direction !== 'outbound') {
      return NextResponse.json({ error: 'Stallion Express label purchase is only supported for outbound shipments' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({})) as {
      preferredCarrier?: string
      preferredServiceLevelToken?: string
      parcel?: {
        length?: number
        width?: number
        height?: number
        weight?: number
        distanceUnit?: 'in' | 'cm'
        massUnit?: 'lb' | 'kg' | 'oz' | 'g'
      }
    }

    const dimensions = shipment.dimensions as { length?: number; width?: number; height?: number } | undefined
    const parcel = {
      length: body.parcel?.length ?? dimensions?.length ?? 12,
      width: body.parcel?.width ?? dimensions?.width ?? 8,
      height: body.parcel?.height ?? dimensions?.height ?? 4,
      weight: body.parcel?.weight ?? shipment.weight ?? 2,
      distanceUnit: body.parcel?.distanceUnit || ('in' as const),
      massUnit: body.parcel?.massUnit || ('lb' as const),
    }

    const fromAddress = shipment.from_address as unknown as AddressInput
    const toAddress = shipment.to_address as unknown as AddressInput

    // Get order number for reference
    const orderId = shipment.order_id
      ? (await supabase.from('orders').select('order_number').eq('id', shipment.order_id).single()).data?.order_number
      : undefined

    // Purchase label via Stallion Express
    const result = await StallionService.purchaseLabel({
      fromAddress,
      toAddress,
      parcel,
      preferredCarrier: body.preferredCarrier,
      preferredServiceLevelToken: body.preferredServiceLevelToken,
      orderId,
    })

    // Attach label data to shipment
    const updated = await ShipmentService.attachLabelPurchase(params.id, {
      stallion_shipment_id: result.stallion_shipment_id,
      tracking_number: result.tracking_number,
      carrier: result.carrier,
      tracking_status: result.tracking_status,
      label_url: result.label_url,
      label_pdf_url: result.label_pdf_url,
      rate_amount: result.rate_amount,
      rate_currency: result.rate_currency,
      estimated_delivery: result.estimated_delivery,
      raw_response: result.stallion_raw,
      purchased_by_id: user.id,
    })

    return NextResponse.json({ ...updated, provider: 'stallion' })
  } catch (error) {
    console.error('Error purchasing label:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to purchase label') },
      { status: 500 }
    )
  }
}
