
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getShipmentByIdMock = vi.fn()
const attachLabelPurchaseMock = vi.fn()
const isShippingConfiguredMock = vi.fn()
const purchaseLabelMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()

vi.mock('@/services/shipment.service', () => ({
  isShippingConfigured: isShippingConfiguredMock,
  ShipmentService: {
    getShipmentById: getShipmentByIdMock,
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

function makeSupabase({ user, role = 'coe_manager' }: { user: { id: string } | null; role?: string }) {
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table !== 'users') throw new Error(`Unexpected table: ${table}`)
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: role ? { role } : null }),
    }
  })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: fromMock,
  }
}

describe('POST /api/shipments/[id]/purchase-label', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isShippingConfiguredMock.mockReturnValue(true)
    getShipmentByIdMock.mockResolvedValue({
      id: 'shipment-1',
      direction: 'outbound',
      from_address: { name: 'A', street1: '1', city: 'Austin', state: 'TX', postal_code: '73301', country: 'US' },
      to_address: { name: 'B', street1: '2', city: 'Dallas', state: 'TX', postal_code: '75001', country: 'US' },
      dimensions: { length: 12, width: 8, height: 4 },
      weight: 2,
    })
    purchaseLabelMock.mockResolvedValue({
      stallion_shipment_id: 'stallion_1',
      tracking_number: 'TRACK123',
      carrier: 'FedEx',
      tracking_status: 'label_created',
      stallion_raw: {},
    })
    attachLabelPurchaseMock.mockResolvedValue({ id: 'shipment-1', tracking_number: 'TRACK123' })
  })

  it('returns 401 without authenticated user', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: null }))
    const { POST } = await import('@/app/api/shipments/[id]/purchase-label/route')

    const response = await POST(
      new NextRequest('http://localhost/api/shipments/shipment-1/purchase-label', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: { id: 'shipment-1' } }
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 when shipment is inbound', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'u1' } }))
    getShipmentByIdMock.mockResolvedValueOnce({ id: 'shipment-1', direction: 'inbound' })

    const { POST } = await import('@/app/api/shipments/[id]/purchase-label/route')
    const response = await POST(
      new NextRequest('http://localhost/api/shipments/shipment-1/purchase-label', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: { id: 'shipment-1' } }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Stallion Express label purchase is only supported for outbound shipments',
    })
  })

  it('purchases and attaches label for outbound shipment', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'u1' } }))

    const { POST } = await import('@/app/api/shipments/[id]/purchase-label/route')
    const response = await POST(
      new NextRequest('http://localhost/api/shipments/shipment-1/purchase-label', {
        method: 'POST',
        body: JSON.stringify({ preferredCarrier: 'FedEx' }),
      }),
      { params: { id: 'shipment-1' } }
    )

    expect(response.status).toBe(200)
    expect(purchaseLabelMock).toHaveBeenCalledTimes(1)
    expect(attachLabelPurchaseMock).toHaveBeenCalledWith('shipment-1', expect.objectContaining({
      stallion_shipment_id: 'stallion_1',
      purchased_by_id: 'u1',
    }))
  })
})
