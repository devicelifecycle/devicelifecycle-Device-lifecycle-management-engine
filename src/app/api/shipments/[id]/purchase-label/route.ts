import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ShipmentService } from '@/services/shipment.service'
import { ShippoService } from '@/services/shippo.service'

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

    const shipment = await ShipmentService.getShipmentById(params.id)
    if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    if (shipment.direction !== 'outbound') {
      return NextResponse.json({ error: 'Shippo label purchase is only supported for outbound shipments' }, { status: 400 })
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
      distanceUnit: body.parcel?.distanceUnit || 'in',
      massUnit: body.parcel?.massUnit || 'lb',
    }

    const purchased = await ShippoService.purchaseLabel({
      fromAddress: shipment.from_address as unknown as import('@/services/shipment.service').AddressInput,
      toAddress: shipment.to_address as unknown as import('@/services/shipment.service').AddressInput,
      parcel,
      preferredCarrier: body.preferredCarrier,
      preferredServiceLevelToken: body.preferredServiceLevelToken,
    })

    const updated = await ShipmentService.attachShippoPurchase(params.id, {
      ...purchased,
      purchased_by_id: user.id,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error purchasing Shippo label:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to purchase label' },
      { status: 500 }
    )
  }
}
