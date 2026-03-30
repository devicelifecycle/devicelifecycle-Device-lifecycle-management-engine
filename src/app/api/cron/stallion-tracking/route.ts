import { NextRequest, NextResponse } from 'next/server'
import { readServerEnv } from '@/lib/server-env'
import { ShipmentService, isShippingConfigured } from '@/services/shipment.service'
import { StallionService } from '@/services/stallion.service'

export const dynamic = 'force-dynamic'

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
    const cronSecret = readServerEnv('CRON_SECRET')

    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set. Cron endpoint disabled.')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isShippingConfigured()) {
      return NextResponse.json({ skipped: true, reason: 'Stallion Express is not configured' }, { status: 200 })
    }

    // Use service-role — cron has no user session
    const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
    const supabase = createServiceRoleClient()
    const { data: shipments, error } = await supabase
      .from('shipments')
      .select('id, carrier, tracking_number, status')
      .not('tracking_number', 'is', null)
      .not('status', 'in', '(delivered,exception)')
      .order('updated_at', { ascending: true })
      .limit(100)

    if (error) throw error

    let updated = 0
    let failed = 0
    const results: Array<{ id: string; status: string }> = []

    for (const shipment of shipments || []) {
      try {
        // Fetch tracking from Stallion Express
        const tracking = await StallionService.fetchTrackingStatus(shipment.tracking_number)

        // Update shipment status if changed
        if (tracking.internal_status !== shipment.status) {
          await ShipmentService.updateShipmentStatus(shipment.id, tracking.internal_status, {
            exception_details: tracking.internal_status === 'exception' ? (tracking.status_details || 'Carrier exception') : undefined,
          })
        }

        // Add tracking event
        await ShipmentService.addTrackingEvent(shipment.id, {
          status: tracking.stallion_tracking_status,
          description: tracking.status_details || 'Tracking status update',
          location: tracking.location || 'N/A',
          timestamp: tracking.status_date || new Date().toISOString(),
        })

        // Update tracking meta
        await ShipmentService.updateTrackingMeta(shipment.id, {
          tracking_status: tracking.stallion_tracking_status,
        })

        updated++
        results.push({ id: shipment.id, status: tracking.internal_status })
      } catch (e) {
        console.error('Stallion tracking sync failed for shipment', shipment.id, e)
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      provider: 'stallion',
      processed: shipments?.length || 0,
      updated,
      failed,
      results,
    })
  } catch (error) {
    console.error('Tracking cron error:', error)
    return NextResponse.json({ error: 'Failed to sync tracking' }, { status: 500 })
  }
}
