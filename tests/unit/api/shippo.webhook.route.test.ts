import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const processShippoWebhookMock = vi.fn()

vi.mock('@/services/shipment.service', () => ({
  ShipmentService: {
    processShippoWebhook: processShippoWebhookMock,
  },
}))

const validateWebhookMock = vi.fn()
vi.mock('@/services/shippo.service', () => ({
  ShippoService: {
    validateWebhook: validateWebhookMock,
  },
}))

describe('POST /api/shippo/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    validateWebhookMock.mockReturnValue(true)
    processShippoWebhookMock.mockResolvedValue(undefined)
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
    expect(processShippoWebhookMock).not.toHaveBeenCalled()
  })

  it('calls processShippoWebhook and returns ok for valid payload', async () => {
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
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(processShippoWebhookMock).toHaveBeenCalledWith({
      tracking_number: 'TRACK123',
      shippo_tracking_status: 'TRANSIT',
      status_details: 'Package in transit',
      status_date: '2026-02-27T12:00:00.000Z',
      location: { city: 'Dallas', state: 'TX', country: 'US' },
      event: 'track_updated',
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
    expect(processShippoWebhookMock).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON payload', async () => {
    const { POST } = await import('@/app/api/shippo/webhook/route')
    const req = new NextRequest('http://localhost:3000/api/shippo/webhook', {
      method: 'POST',
      body: 'not valid json {',
      headers: { 'content-type': 'application/json', 'shippo-signature': 'ok' },
    })

    const response = await POST(req)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON payload' })
    expect(processShippoWebhookMock).not.toHaveBeenCalled()
  })
})
