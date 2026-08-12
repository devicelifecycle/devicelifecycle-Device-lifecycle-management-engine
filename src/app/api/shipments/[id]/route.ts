// ============================================================================
// SHIPMENT BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { ShipmentService } from '@/services/shipment.service'
import { shipmentPatchSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const shipment = await ShipmentService.getShipmentById((await params).id)
    if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Enforce org boundary for coe_tech (IDOR prevention)
    if (profile.role === 'coe_tech' && profile.organization_id && shipment.order_id) {
      const order = shipment.order as { customer_id?: string; vendor_id?: string } | undefined
      const [customerResult, vendorResult] = await Promise.all([
        order?.customer_id
          ? supabase.from('customers').select('organization_id').eq('id', order.customer_id).single()
          : Promise.resolve({ data: null }),
        order?.vendor_id
          ? supabase.from('vendors').select('organization_id').eq('id', order.vendor_id).single()
          : Promise.resolve({ data: null }),
      ])
      const hasAccess =
        customerResult.data?.organization_id === profile.organization_id ||
        vendorResult.data?.organization_id === profile.organization_id
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    return NextResponse.json(shipment)
  } catch (error) {
    console.error('Error fetching shipment:', error)
    return NextResponse.json({ error: 'Failed to fetch shipment' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const shipment = await ShipmentService.getShipmentById((await params).id)
    if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Enforce org boundary for coe_tech (IDOR prevention)
    if (profile.role === 'coe_tech' && profile.organization_id && shipment.order_id) {
      const order = shipment.order as { customer_id?: string; vendor_id?: string } | undefined
      const [customerResult, vendorResult] = await Promise.all([
        order?.customer_id
          ? supabase.from('customers').select('organization_id').eq('id', order.customer_id).single()
          : Promise.resolve({ data: null }),
        order?.vendor_id
          ? supabase.from('vendors').select('organization_id').eq('id', order.vendor_id).single()
          : Promise.resolve({ data: null }),
      ])
      const hasAccess =
        customerResult.data?.organization_id === profile.organization_id ||
        vendorResult.data?.organization_id === profile.organization_id
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    const validation = shipmentPatchSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }
    const data = validation.data

    if (data.action === 'receive') {
      const shipment = await ShipmentService.markAsReceived(
        (await params).id,
        authUser.id,
        data.notes,
        {
          receivedQuantity: data.received_quantity,
          expectedQuantity: data.expected_quantity,
        }
      )
      return NextResponse.json(shipment)
    }

    if (data.status) {
      // A shipment must already have a carrier and tracking number before its
      // status can be advanced. These are set at creation time and live on the
      // shipment record — the client does not (and should not) re-send them on a
      // status update, so validate against the loaded shipment, not the request body.
      if (!shipment.carrier || !shipment.tracking_number) {
        return NextResponse.json(
          { error: 'Shipment is missing a carrier or tracking number' },
          { status: 400 }
        )
      }
      const updated = await ShipmentService.updateShipmentStatus(
        (await params).id,
        data.status,
        data.metadata
      )
      return NextResponse.json(updated)
    }

    return NextResponse.json({ error: 'Invalid update' }, { status: 400 })
  } catch (error) {
    console.error('Error updating shipment:', error)
    return NextResponse.json({ error: 'Failed to update shipment' }, { status: 500 })
  }
}
