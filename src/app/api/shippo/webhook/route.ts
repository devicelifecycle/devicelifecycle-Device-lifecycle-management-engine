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
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const signature = request.headers.get('shippo-signature') || request.headers.get('x-shippo-signature')
  if (!ShippoService.validateWebhook(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: ShippoTrackWebhookPayload
  try {
    payload = JSON.parse(rawBody) as ShippoTrackWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  try {
    const trackingNumber = payload.data?.tracking_number
    const trackingStatus = payload.data?.tracking_status?.status || 'UNKNOWN'

    if (!trackingNumber) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    await ShipmentService.processShippoWebhook({
      tracking_number: trackingNumber,
      shippo_tracking_status: trackingStatus,
      status_details: payload.data?.tracking_status?.status_details,
      status_date: payload.data?.tracking_status?.status_date,
      location: payload.data?.tracking_status?.location,
      event: payload.event,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Shippo webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
