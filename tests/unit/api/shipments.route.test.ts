import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createShipmentMock = vi.fn()
const attachLabelPurchaseMock = vi.fn()
const isShippingConfiguredMock = vi.fn()
const purchaseLabelMock = vi.fn()
const transitionOrderMock = vi.fn()
const createNotificationMock = vi.fn()

const createServerSupabaseClientMock = vi.fn()
const createServiceRoleClientMock = vi.fn()

vi.mock('@/services/shipment.service', () => ({
  isShippingConfigured: isShippingConfiguredMock,
  ShipmentService: {
    createShipment: createShipmentMock,
    attachLabelPurchase: attachLabelPurchaseMock,
  },
}))

vi.mock('@/services/shipping-provider.service', () => ({
  ShippingProviderService: {
    purchaseLabel: purchaseLabelMock,
  },
}))

vi.mock('@/services/order.service', () => ({
  OrderService: {
    transitionOrder: transitionOrderMock,
  },
}))

vi.mock('@/services/notification.service', () => ({
  NotificationService: {
    createNotification: createNotificationMock,
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
  profile = { role: 'coe_manager' },
  order = null,
}: {
  user: { id: string } | null
  profile?: { role?: string; organization_id?: string }
  order?: Record<string, unknown> | null
}) {
  const deleteEqMock = vi.fn().mockResolvedValue({ error: null })
  const deleteMock = vi.fn().mockReturnValue({ eq: deleteEqMock })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'users') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: profile }),
      }
    }

    if (table === 'orders') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: order }),
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
    transitionOrderMock.mockResolvedValue({ id: 'order-1', status: 'shipped_to_coe' })
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'shipments') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }

        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { order_number: 'ORD-TEST-1' } }),
          }
        }

        if (table === 'users') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null }),
          }
        }

        throw new Error(`Unexpected service-role table: ${table}`)
      }),
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
        from_address: { name: 'A', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'B', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'tracking_number is required',
    })
    expect(createShipmentMock).not.toHaveBeenCalled()
  })

  it('returns 400 when a custom carrier name is missing', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'user-1' } }))

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-1',
        direction: 'outbound',
        carrier: 'Other',
        stallion_purchase: false,
        tracking_number: 'TRACK-1',
        from_address: { name: 'A', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'B', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'custom_carrier is required when carrier is Other',
    })
    expect(createShipmentMock).not.toHaveBeenCalled()
  })

  it('accepts manual tracking from a custom shipping platform', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'user-1' } }))

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-1',
        direction: 'outbound',
        carrier: 'Other',
        custom_carrier: 'ShipStation',
        stallion_purchase: false,
        tracking_number: '  TRACK-CUSTOM-1  ',
        from_address: { name: 'A', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'B', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(201)
    expect(createShipmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: 'order-1',
        direction: 'outbound',
        carrier: 'ShipStation',
        tracking_number: 'TRACK-CUSTOM-1',
        created_by_id: 'user-1',
      }),
    )
  })

  it('ignores stallion_purchase flag and creates shipment with provided tracking number', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'user-1' } }))

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-1',
        direction: 'outbound',
        carrier: 'FedEx',
        stallion_purchase: true,
        tracking_number: 'TRACK-MANUAL-1',
        from_address: { name: 'A', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'B', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(201)
    expect(createShipmentMock).toHaveBeenCalledTimes(1)
    expect(purchaseLabelMock).not.toHaveBeenCalled()
    expect(attachLabelPurchaseMock).not.toHaveBeenCalled()
  })

  it('creates shipment with tracking number and does not call label purchase', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'user-1' } }))

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-1',
        direction: 'outbound',
        carrier: 'FedEx',
        tracking_number: 'TRACK-456',
        from_address: { name: 'A', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'B', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(createShipmentMock).toHaveBeenCalledTimes(1)
    expect(purchaseLabelMock).not.toHaveBeenCalled()
    expect(attachLabelPurchaseMock).not.toHaveBeenCalled()
  })

  it('auto-transitions accepted trade-in orders when a customer submits an inbound shipment', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'customer-1' },
        profile: { role: 'customer', organization_id: 'org-1' },
        order: {
          status: 'accepted',
          type: 'trade_in',
          customer: { organization_id: 'org-1' },
        },
      }),
    )

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-1',
        direction: 'inbound',
        carrier: 'FedEx',
        stallion_purchase: false,
        tracking_number: 'TRACK-CUSTOMER-1',
        from_address: { name: 'Customer', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'COE', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(createShipmentMock).toHaveBeenCalledTimes(1)
    expect(transitionOrderMock).toHaveBeenCalledWith(
      'order-1',
      'shipped_to_coe',
      'customer-1',
      'Customer submitted inbound shipment',
    )
  })

  it('allows a vendor to upload tracking for their own sourced order', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'vendor-user-1' },
        profile: { role: 'vendor', organization_id: 'vendor-org-1' },
        order: {
          status: 'sourced',
          vendor: { organization_id: 'vendor-org-1' },
        },
      }),
    )

    const { POST } = await import('@/app/api/shipments/route')
    const request = new NextRequest('http://localhost:3000/api/shipments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'order-5',
        carrier: 'FedEx',
        tracking_number: 'TRACK-VENDOR-1',
        direction: 'inbound',
        from_address: { name: 'Vendor', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
        to_address: { name: 'COE', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
      }),
      headers: { 'content-type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(createShipmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: 'order-5',
        direction: 'inbound',
        carrier: 'FedEx',
        tracking_number: 'TRACK-VENDOR-1',
        created_by_id: 'vendor-user-1',
      }),
    )
    expect(transitionOrderMock).not.toHaveBeenCalled()
  })

  it('blocks vendors from creating outbound shipments', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'vendor-user-1' },
        profile: { role: 'vendor', organization_id: 'vendor-org-1' },
        order: {
          status: 'sourced',
          vendor: { organization_id: 'vendor-org-1' },
        },
      }),
    )

    const { POST } = await import('@/app/api/shipments/route')
    const outboundResponse = await POST(
      new NextRequest('http://localhost:3000/api/shipments', {
        method: 'POST',
        body: JSON.stringify({
          order_id: 'order-5',
          carrier: 'FedEx',
          tracking_number: 'TRACK-VENDOR-2',
          direction: 'outbound',
          from_address: { name: 'Vendor', street1: '1', city: 'A', state: 'TX', postal_code: '73301', country: 'US' },
          to_address: { name: 'COE', street1: '2', city: 'B', state: 'TX', postal_code: '75001', country: 'US' },
        }),
        headers: { 'content-type': 'application/json' },
      }),
    )

    expect(outboundResponse.status).toBe(400)
    await expect(outboundResponse.json()).resolves.toEqual({
      error: 'Vendor shipments must be inbound to COE',
    })
    expect(createShipmentMock).not.toHaveBeenCalled()
  })
})
