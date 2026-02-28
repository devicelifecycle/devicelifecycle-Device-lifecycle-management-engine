import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getShipmentByTrackingNumberMock = vi.fn()
const updateShipmentStatusMock = vi.fn()
const addTrackingEventMock = vi.fn()
const updateShippoTrackingMetaMock = vi.fn()

const validateWebhookMock = vi.fn()
const mapStatusMock = vi.fn()

vi.mock('@/services/shipment.service', () => ({
  ShipmentService: {
    getShipmentByTrackingNumber: getShipmentByTrackingNumberMock,
    updateShipmentStatus: updateShipmentStatusMock,
    addTrackingEvent: addTrackingEventMock,
    updateShippoTrackingMeta: updateShippoTrackingMetaMock,
  },
}))

vi.mock('@/services/shippo.service', () => ({
  ShippoService: {
    validateWebhook: validateWebhookMock,
    mapShippoTrackingStatusToInternal: mapStatusMock,
  },
}))

describe('POST /api/shippo/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mapStatusMock.mockReturnValue('in_transit')
    validateWebhookMock.mockReturnValue(true)
  })

  it('returns 401 when webhook signature is invalid', async () => {
    validateWebhookMock.mockReturnValue(false)

    const { POST } = await import('@/app/api/shippo/webhook/route')
    const req = new NextRequest('http://localhost:3000/api/shippo/webhook', {
      method: 'POST',
      body: JSON.stringify({ data: { tracking_number: 'TRACK123' } }),
      headers: { 'content-type': 'application/json', 'shippo-signature': 'bad' },
    })

    const response = await POST(req)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid signature' })
  })

  it('applies status update and tracking event for known shipment', async () => {
    getShipmentByTrackingNumberMock.mockResolvedValue({ id: 'shipment-1' })

    const { POST } = await import('@/app/api/shippo/webhook/route')
    const req = new NextRequest('http://localhost:3000/api/shippo/webhook', {
      method: 'POST',
      body: JSON.stringify({
        event: 'track_updated',
        data: {
          tracking_number: 'TRACK123',
          tracking_status: {
            status: 'TRANSIT',
            status_details: 'Package in transit',
            status_date: '2026-02-27T12:00:00.000Z',
            location: { city: 'Dallas', state: 'TX', country: 'US' },
          },
        },
      }),
      headers: { 'content-type': 'application/json', 'shippo-signature': 'ok' },
    })

    const response = await POST(req)

    expect(response.status).toBe(200)
    expect(getShipmentByTrackingNumberMock).toHaveBeenCalledWith('TRACK123')
    expect(mapStatusMock).toHaveBeenCalledWith('TRANSIT')
    expect(updateShipmentStatusMock).toHaveBeenCalledWith('shipment-1', 'in_transit', {
      exception_details: undefined,
    })
    expect(addTrackingEventMock).toHaveBeenCalledTimes(1)
    expect(updateShippoTrackingMetaMock).toHaveBeenCalledWith('shipment-1', {
      shippo_tracking_status: 'TRANSIT',
    })
  })

  it('returns skipped when tracking number is missing', async () => {
    const { POST } = await import('@/app/api/shippo/webhook/route')
    const req = new NextRequest('http://localhost:3000/api/shippo/webhook', {
      method: 'POST',
      body: JSON.stringify({ event: 'track_updated', data: {} }),
      headers: { 'content-type': 'application/json', 'shippo-signature': 'ok' },
    })

    const response = await POST(req)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, skipped: true })
    expect(getShipmentByTrackingNumberMock).not.toHaveBeenCalled()
  })

  it('returns skipped when shipment is not found', async () => {
    getShipmentByTrackingNumberMock.mockResolvedValue(null)

    const { POST } = await import('@/app/api/shippo/webhook/route')
    const req = new NextRequest('http://localhost:3000/api/shippo/webhook', {
      method: 'POST',
      body: JSON.stringify({
        event: 'track_updated',
        data: { tracking_number: 'MISSING-TRACK', tracking_status: { status: 'TRANSIT' } },
      }),
      headers: { 'content-type': 'application/json', 'shippo-signature': 'ok' },
    })

    const response = await POST(req)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: true,
      reason: 'shipment_not_found',
    })
    expect(updateShipmentStatusMock).not.toHaveBeenCalled()
  })
})
