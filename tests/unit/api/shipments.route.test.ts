import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createShipmentMock = vi.fn()
const attachShippoPurchaseMock = vi.fn()
const purchaseLabelMock = vi.fn()

const createServerSupabaseClientMock = vi.fn()

vi.mock('@/services/shipment.service', () => ({
  ShipmentService: {
    createShipment: createShipmentMock,
    attachShippoPurchase: attachShippoPurchaseMock,
  },
}))

vi.mock('@/services/shippo.service', () => ({
  ShippoService: {
    purchaseLabel: purchaseLabelMock,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

function makeSupabase({
  user,
  role = 'coe_manager',
}: {
  user: { id: string } | null
  role?: string
}) {
  const deleteEqMock = vi.fn().mockResolvedValue({ error: null })
  const deleteMock = vi.fn().mockReturnValue({ eq: deleteEqMock })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'users') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: role ? { role } : null }),
      }
    }

    if (table === 'shipments') {
      return {
        delete: deleteMock,
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: fromMock,
    __deleteEqMock: deleteEqMock,
  }
}

describe('POST /api/shipments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createShipmentMock.mockResolvedValue({ id: 'shipment-1' })
    attachShippoPurchaseMock.mockResolvedValue({ id: 'shipment-1', tracking_number: 'TRACK123' })
    purchaseLabelMock.mockResolvedValue({
      shippo_shipment_id: 'shp_123',
      shippo_rate_id: 'rate_123',
      shippo_transaction_id: 'tx_123',
      tracking_number: 'TRACK123',
      carrier: 'FedEx',
      shippo_raw: {},
    })
  })

  it('returns 400 when manual shipment has no tracking number', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'user-1' } }))

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-1',
        direction: 'outbound',
        carrier: 'FedEx',
        shippo_purchase: false,
        from_address: { name: 'A', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'B', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'tracking_number is required when shippo_purchase is false',
    })
    expect(createShipmentMock).not.toHaveBeenCalled()
  })

  it('rolls back local shipment when Shippo purchase fails', async () => {
    const supabase = makeSupabase({ user: { id: 'user-1' } })
    createServerSupabaseClientMock.mockReturnValue(supabase)

    createShipmentMock.mockResolvedValue({ id: 'shipment-rollback' })
    purchaseLabelMock.mockRejectedValue(new Error('Shippo outage'))

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-1',
        direction: 'outbound',
        carrier: 'FedEx',
        shippo_purchase: true,
        from_address: { name: 'A', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'B', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to create shipment' })

    expect(supabase.__deleteEqMock).toHaveBeenCalledWith('id', 'shipment-rollback')
    expect(attachShippoPurchaseMock).not.toHaveBeenCalled()
  })

  it('creates and attaches Shippo purchase successfully', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'user-1' } }))

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-1',
        direction: 'outbound',
        carrier: 'FedEx',
        shippo_purchase: true,
        weight: 3,
        dimensions: { length: 10, width: 5, height: 4 },
        from_address: { name: 'A', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'B', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(createShipmentMock).toHaveBeenCalledTimes(1)
    expect(purchaseLabelMock).toHaveBeenCalledTimes(1)
    expect(attachShippoPurchaseMock).toHaveBeenCalledTimes(1)
  })
})
