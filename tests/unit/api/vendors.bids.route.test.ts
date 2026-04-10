import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const submitBidMock = vi.fn()
const createNotificationMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()
const createServiceRoleClientMock = vi.fn()

vi.mock('@/services/vendor.service', () => ({
  VendorService: {
    submitBid: submitBidMock,
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

function makeServerSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'vendor-user-1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns === 'role, organization_id') {
              return {
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { role: 'vendor', organization_id: 'vendor-org-1' },
                  }),
                }),
              }
            }

            const adminQuery: Record<string, unknown> = {
              eq: vi.fn().mockImplementation(() => adminQuery),
              then: (resolve: (value: { data: unknown[] }) => unknown) =>
                Promise.resolve({ data: [] }).then(resolve),
            }
            return adminQuery
          }),
        }
      }

      if (table === 'vendors') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'vendor-1' },
                }),
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function makeServiceRoleSupabase({
  order,
  existingBid = null,
}: {
  order: Record<string, unknown> | null
  existingBid?: Record<string, unknown> | null
}) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: order,
                error: order ? null : { message: 'not found' },
              }),
            }),
          }),
        }
      }

      if (table === 'vendor_bids') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: existingBid,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected service-role table: ${table}`)
    }),
  }
}

describe('POST /api/vendors/bids', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    createServerSupabaseClientMock.mockReturnValue(makeServerSupabase())
    submitBidMock.mockResolvedValue({
      id: 'bid-1',
      order_id: '11111111-1111-1111-1111-111111111111',
      vendor_id: 'vendor-1',
      quantity: 5,
      unit_price: 120,
      total_price: 600,
      status: 'pending',
    })
  })

  it('allows vendors to bid on open CPO orders', async () => {
    createServiceRoleClientMock.mockReturnValue(
      makeServiceRoleSupabase({
        order: {
          id: '11111111-1111-1111-1111-111111111111',
          order_number: 'CPO-1001',
          type: 'cpo',
          status: 'sourcing',
          total_quantity: 10,
          vendor_id: null,
          parent_order_id: null,
        },
      }),
    )

    const { POST } = await import('@/app/api/vendors/bids/route')

    const response = await POST(
      new NextRequest('http://localhost:3000/api/vendors/bids', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: '11111111-1111-1111-1111-111111111111',
          quantity: 5,
          unit_price: 120,
          lead_time_days: 3,
          warranty_days: 30,
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(submitBidMock).toHaveBeenCalledWith({
      order_id: '11111111-1111-1111-1111-111111111111',
      vendor_id: 'vendor-1',
      quantity: 5,
      unit_price: 120,
      lead_time_days: 3,
      warranty_days: 30,
      notes: undefined,
    })
  })

  it('rejects bids once an order is already assigned to another vendor', async () => {
    createServiceRoleClientMock.mockReturnValue(
      makeServiceRoleSupabase({
        order: {
          id: '11111111-1111-1111-1111-111111111111',
          order_number: 'CPO-1001',
          type: 'cpo',
          status: 'sourcing',
          total_quantity: 10,
          vendor_id: 'vendor-2',
          parent_order_id: null,
        },
      }),
    )

    const { POST } = await import('@/app/api/vendors/bids/route')

    const response = await POST(
      new NextRequest('http://localhost:3000/api/vendors/bids', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: '11111111-1111-1111-1111-111111111111',
          quantity: 5,
          unit_price: 120,
          lead_time_days: 3,
          warranty_days: 30,
        }),
      }),
    )

    expect(response.status).toBe(409)
    expect(submitBidMock).not.toHaveBeenCalled()
  })

  it('rejects duplicate active bids from the same vendor', async () => {
    createServiceRoleClientMock.mockReturnValue(
      makeServiceRoleSupabase({
        order: {
          id: '11111111-1111-1111-1111-111111111111',
          order_number: 'CPO-1001',
          type: 'cpo',
          status: 'accepted',
          total_quantity: 10,
          vendor_id: null,
          parent_order_id: null,
        },
        existingBid: {
          id: 'bid-existing',
          status: 'pending',
        },
      }),
    )

    const { POST } = await import('@/app/api/vendors/bids/route')

    const response = await POST(
      new NextRequest('http://localhost:3000/api/vendors/bids', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_id: '11111111-1111-1111-1111-111111111111',
          quantity: 5,
          unit_price: 120,
          lead_time_days: 3,
          warranty_days: 30,
        }),
      }),
    )

    expect(response.status).toBe(409)
    expect(submitBidMock).not.toHaveBeenCalled()
  })
})
