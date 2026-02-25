// ============================================================================
// SHIPMENT BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ShipmentService } from '@/services/shipment.service'

export async function GET(
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

    if (!profile || ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const shipment = await ShipmentService.getShipmentById(params.id)
    if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

    if (body.action === 'receive') {
      const shipment = await ShipmentService.markAsReceived(
        params.id,
        user.id,
        body.notes
      )
      return NextResponse.json(shipment)
    }

    if (body.status) {
      const shipment = await ShipmentService.updateShipmentStatus(
        params.id,
        body.status,
        body.metadata
      )
      return NextResponse.json(shipment)
    }

    return NextResponse.json({ error: 'Invalid update' }, { status: 400 })
  } catch (error) {
    console.error('Error updating shipment:', error)
    return NextResponse.json({ error: 'Failed to update shipment' }, { status: 500 })
  }
}
