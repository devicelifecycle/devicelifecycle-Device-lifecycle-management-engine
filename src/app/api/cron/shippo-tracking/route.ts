import { NextRequest, NextResponse } from 'next/server'
import { ShipmentService } from '@/services/shipment.service'
import { ShippoService } from '@/services/shippo.service'

const CRON_SECRET = process.env.CRON_SECRET

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function GET(request: NextRequest) {
  try {
    if (!CRON_SECRET) {
      console.error('CRON_SECRET environment variable is not set. Cron endpoint disabled.')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${CRON_SECRET}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use service-role — cron has no user session
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const supabase = createServiceRoleClient()
    const { data: shipments, error } = await supabase
      .from('shipments')
      .select('id, carrier, tracking_number, status')
      .eq('direction', 'outbound')
      .not('status', 'in', '(delivered,exception)')
      .order('updated_at', { ascending: true })
      .limit(100)

    if (error) throw error

    let updated = 0
    let failed = 0

    for (const shipment of shipments || []) {
      try {
        const tracking = await ShippoService.fetchTrackingStatus(shipment.carrier, shipment.tracking_number)
        if (tracking.internal_status !== shipment.status) {
          await ShipmentService.updateShipmentStatus(shipment.id, tracking.internal_status, {
            exception_details: tracking.internal_status === 'exception' ? (tracking.status_details || 'Carrier exception') : undefined,
          })
        }

        await ShipmentService.addTrackingEvent(shipment.id, {
          status: tracking.shippo_tracking_status,
          description: tracking.status_details || 'Tracking status update',
          location: tracking.location || 'N/A',
          timestamp: tracking.status_date || new Date().toISOString(),
        })

        await ShipmentService.updateShippoTrackingMeta(shipment.id, {
          shippo_tracking_status: tracking.shippo_tracking_status,
        })
        updated++
      } catch (e) {
        console.error('Shippo tracking sync failed for shipment', shipment.id, e)
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      processed: shipments?.length || 0,
      updated,
      failed,
    })
  } catch (error) {
    console.error('Shippo tracking cron error:', error)
    return NextResponse.json({ error: 'Failed to sync Shippo tracking' }, { status: 500 })
  }
}
