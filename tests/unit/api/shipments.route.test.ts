import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createShipmentMock = vi.fn()
const attachLabelPurchaseMock = vi.fn()
const isShippingConfiguredMock = vi.fn()
const purchaseLabelMock = vi.fn()

const createServerSupabaseClientMock = vi.fn()
const createServiceRoleClientMock = vi.fn()

vi.mock('@/services/shipment.service', () => ({
  isShippingConfigured: isShippingConfiguredMock,
  ShipmentService: {
    createShipment: createShipmentMock,
    attachLabelPurchase: attachLabelPurchaseMock,
  },
}))

vi.mock('@/services/stallion.service', () => ({
  StallionService: {
    purchaseLabel: purchaseLabelMock,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
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
    attachLabelPurchaseMock.mockResolvedValue({ id: 'shipment-1', tracking_number: 'TRACK123' })
    isShippingConfiguredMock.mockReturnValue(true)
    purchaseLabelMock.mockResolvedValue({
      stallion_shipment_id: 'stallion_123',
      tracking_number: 'TRACK123',
      carrier: 'FedEx',
      tracking_status: 'label_created',
      stallion_raw: {},
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
        stallion_purchase: false,
        from_address: { name: 'A', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'B', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'tracking_number is required when stallion_purchase is false',
    })
    expect(createShipmentMock).not.toHaveBeenCalled()
  })

  it('rolls back local shipment when Stallion purchase fails', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'user-1' } }))

    const serviceRoleEqMock = vi.fn().mockResolvedValue({ error: null })
    const serviceRoleDeleteMock = vi.fn().mockReturnValue({ eq: serviceRoleEqMock })
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ delete: serviceRoleDeleteMock }),
    })

    createShipmentMock.mockResolvedValue({ id: 'shipment-rollback' })
    purchaseLabelMock.mockRejectedValue(new Error('Stallion outage'))

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-1',
        direction: 'outbound',
        carrier: 'FedEx',
        stallion_purchase: true,
        from_address: { name: 'A', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'B', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)
    // Route returns 400 with descriptive message (not 500) when Stallion purchase fails
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toContain('Stallion label purchase failed')
    expect(json.error).toContain('Stallion outage')

    expect(createServiceRoleClientMock).toHaveBeenCalled()
    expect(attachLabelPurchaseMock).not.toHaveBeenCalled()
  })

  it('creates and attaches Stallion purchase successfully', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'user-1' } }))

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-1',
        direction: 'outbound',
        carrier: 'FedEx',
        stallion_purchase: true,
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
    expect(attachLabelPurchaseMock).toHaveBeenCalledTimes(1)
  })
})
