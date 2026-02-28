import { NextRequest, NextResponse } from 'next/server'
import { ShipmentService } from '@/services/shipment.service'
import { ShippoService } from '@/services/shippo.service'

interface ShippoTrackWebhookPayload {
  event?: string
  data?: {
    tracking_number?: string
    carrier?: string
    tracking_status?: {
      status?: string
      status_details?: string
      status_date?: string
      location?: {
        city?: string
        state?: string
        country?: string
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('shippo-signature') || request.headers.get('x-shippo-signature')

    if (!ShippoService.validateWebhook(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(rawBody) as ShippoTrackWebhookPayload
    const trackingNumber = payload.data?.tracking_number
    const trackingStatus = payload.data?.tracking_status?.status || 'UNKNOWN'

    if (!trackingNumber) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const shipment = await ShipmentService.getShipmentByTrackingNumber(trackingNumber)
    if (!shipment) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'shipment_not_found' })
    }

    const internalStatus = ShippoService.mapShippoTrackingStatusToInternal(trackingStatus)
    await ShipmentService.updateShipmentStatus(shipment.id, internalStatus, {
      exception_details: internalStatus === 'exception' ? (payload.data?.tracking_status?.status_details || 'Carrier exception') : undefined,
    })

    await ShipmentService.addTrackingEvent(shipment.id, {
      status: trackingStatus,
      description: payload.data?.tracking_status?.status_details || payload.event || 'Tracking update',
      location: [payload.data?.tracking_status?.location?.city, payload.data?.tracking_status?.location?.state, payload.data?.tracking_status?.location?.country]
        .filter(Boolean)
        .join(', ') || 'N/A',
      timestamp: payload.data?.tracking_status?.status_date || new Date().toISOString(),
    })

    await ShipmentService.updateShippoTrackingMeta(shipment.id, {
      shippo_tracking_status: trackingStatus,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Shippo webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
