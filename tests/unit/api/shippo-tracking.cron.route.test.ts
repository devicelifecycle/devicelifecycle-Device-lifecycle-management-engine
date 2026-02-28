import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateShipmentStatusMock = vi.fn()
const addTrackingEventMock = vi.fn()
const updateShippoTrackingMetaMock = vi.fn()
const fetchTrackingStatusMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()

vi.mock('@/services/shipment.service', () => ({
  ShipmentService: {
    updateShipmentStatus: updateShipmentStatusMock,
    addTrackingEvent: addTrackingEventMock,
    updateShippoTrackingMeta: updateShippoTrackingMetaMock,
  },
}))

vi.mock('@/services/shippo.service', () => ({
  ShippoService: {
    fetchTrackingStatus: fetchTrackingStatusMock,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

function makeShipmentsQuery(shipments: Array<{ id: string; carrier: string; tracking_number: string; status: string }>) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: shipments, error: null }),
  }
}

describe('GET /api/cron/shippo-tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(process.env as Record<string, string | undefined>).CRON_SECRET = 'secret123'

    fetchTrackingStatusMock.mockResolvedValue({
      tracking_number: 'TRACK123',
      shippo_tracking_status: 'TRANSIT',
      status_details: 'Package in transit',
      status_date: '2026-02-27T00:00:00.000Z',
      location: 'Dallas, TX, US',
      internal_status: 'in_transit',
    })
  })

  it('returns 401 when auth header is invalid', async () => {
    const supabase = { from: vi.fn().mockReturnValue(makeShipmentsQuery([])) }
    createServerSupabaseClientMock.mockReturnValue(supabase)

    const { GET } = await import('@/app/api/cron/shippo-tracking/route')
    const response = await GET(new NextRequest('http://localhost:3000/api/cron/shippo-tracking', {
      headers: { authorization: 'Bearer wrong' },
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('syncs statuses and returns summary', async () => {
    const shipments = [
      { id: 's1', carrier: 'FedEx', tracking_number: 'TRACK123', status: 'label_created' },
      { id: 's2', carrier: 'UPS', tracking_number: 'TRACK999', status: 'in_transit' },
    ]

    const supabase = {
      from: vi.fn().mockReturnValue(makeShipmentsQuery(shipments)),
    }
    createServerSupabaseClientMock.mockReturnValue(supabase)

    fetchTrackingStatusMock
      .mockResolvedValueOnce({
        tracking_number: 'TRACK123',
        shippo_tracking_status: 'TRANSIT',
        status_details: 'Moved',
        status_date: '2026-02-27T00:00:00.000Z',
        location: 'Dallas, TX, US',
        internal_status: 'in_transit',
      })
      .mockResolvedValueOnce({
        tracking_number: 'TRACK999',
        shippo_tracking_status: 'TRANSIT',
        status_details: 'Still in transit',
        status_date: '2026-02-27T00:00:00.000Z',
        location: 'Austin, TX, US',
        internal_status: 'in_transit',
      })

    const { GET } = await import('@/app/api/cron/shippo-tracking/route')
    const response = await GET(new NextRequest('http://localhost:3000/api/cron/shippo-tracking', {
      headers: { authorization: 'Bearer secret123' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      processed: 2,
      updated: 2,
      failed: 0,
    })

    expect(updateShipmentStatusMock).toHaveBeenCalledWith('s1', 'in_transit', {
      exception_details: undefined,
    })
    expect(addTrackingEventMock).toHaveBeenCalledTimes(2)
    expect(updateShippoTrackingMetaMock).toHaveBeenCalledTimes(2)
  })
})
