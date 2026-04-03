// ============================================================================
// SHIPMENT BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ShipmentService } from '@/services/shipment.service'
import { shipmentPatchSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile || ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const shipment = await ShipmentService.getShipmentById(params.id)
    if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Enforce org boundary for coe_tech (IDOR prevention)
    if (profile.role === 'coe_tech' && profile.organization_id && shipment.order_id) {
      const order = shipment.order as { customer_id?: string; vendor_id?: string } | undefined
      let hasAccess = false
      if (order?.customer_id) {
        const { data: c } = await supabase.from('customers').select('organization_id').eq('id', order.customer_id).single()
        if (c?.organization_id === profile.organization_id) hasAccess = true
      }
      if (!hasAccess && order?.vendor_id) {
        const { data: v } = await supabase.from('vendors').select('organization_id').eq('id', order.vendor_id).single()
        if (v?.organization_id === profile.organization_id) hasAccess = true
      }
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
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const shipment = await ShipmentService.getShipmentById(params.id)
    if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Enforce org boundary for coe_tech (IDOR prevention)
    if (profile.role === 'coe_tech' && profile.organization_id && shipment.order_id) {
      const order = shipment.order as { customer_id?: string; vendor_id?: string } | undefined
      let hasAccess = false
      if (order?.customer_id) {
        const { data: c } = await supabase.from('customers').select('organization_id').eq('id', order.customer_id).single()
        if (c?.organization_id === profile.organization_id) hasAccess = true
      }
      if (!hasAccess && order?.vendor_id) {
        const { data: v } = await supabase.from('vendors').select('organization_id').eq('id', order.vendor_id).single()
        if (v?.organization_id === profile.organization_id) hasAccess = true
      }
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
        params.id,
        user.id,
        data.notes
      )
      return NextResponse.json(shipment)
    }

    if (data.status) {
      const shipment = await ShipmentService.updateShipmentStatus(
        params.id,
        data.status,
        data.metadata
      )
      return NextResponse.json(shipment)
    }

    return NextResponse.json({ error: 'Invalid update' }, { status: 400 })
  } catch (error) {
    console.error('Error updating shipment:', error)
    return NextResponse.json({ error: 'Failed to update shipment' }, { status: 500 })
  }
}
