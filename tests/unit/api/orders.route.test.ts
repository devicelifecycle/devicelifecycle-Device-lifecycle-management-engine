import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getOrdersMock = vi.fn()

vi.mock('@/services/order.service', () => ({
  OrderService: {
    getOrders: getOrdersMock,
  },
}))

vi.mock('@/services/email.service', () => ({
  EmailService: {
    sendOrderConfirmationEmail: vi.fn(),
  },
}))

type Profile = { role?: string; organization_id?: string } | null

const createMockSupabase = ({
  user,
  profile,
}: {
  user: { id: string } | null
  profile: Profile
}) => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user } }),
  },
  from: vi.fn().mockImplementation((table: string) => {
    if (table !== 'users') {
      throw new Error(`Unexpected table: ${table}`)
    }

    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: profile }),
    }
  }),
})

const createServerSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

describe('GET /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getOrdersMock.mockResolvedValue({ data: [], total: 0, page: 1, page_size: 20, total_pages: 0 })
  })

  it('returns 401 when user is not authenticated', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      createMockSupabase({ user: null, profile: null })
    )

    const { GET } = await import('@/app/api/orders/route')
    const response = await GET(new NextRequest('http://localhost:3000/api/orders'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(getOrdersMock).not.toHaveBeenCalled()
  })

  it('passes requester context and parsed filters into OrderService.getOrders', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      createMockSupabase({
        user: { id: 'user-1' },
        profile: { role: 'customer', organization_id: 'org-1' },
      })
    )

    const { GET } = await import('@/app/api/orders/route')
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/orders?status=submitted&type=trade_in&page=2&page_size=10&search=iphone'
      )
    )

    expect(response.status).toBe(200)
    expect(getOrdersMock).toHaveBeenCalledTimes(1)

    const arg = getOrdersMock.mock.calls[0][0]
    expect(arg).toMatchObject({
      status: 'submitted',
      type: 'trade_in',
      page: 2,
      page_size: 10,
      search: 'iphone',
      requester_id: 'user-1',
      requester_role: 'customer',
      requester_organization_id: 'org-1',
    })
  })

  it('includes vendor_id filter when provided', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      createMockSupabase({
        user: { id: 'user-2' },
        profile: { role: 'vendor', organization_id: 'org-v1' },
      })
    )

    const { GET } = await import('@/app/api/orders/route')
    const response = await GET(
      new NextRequest('http://localhost:3000/api/orders?vendor_id=2fb2be63-52d2-45f2-8b6e-ead8d4b5f6fb')
    )

    expect(response.status).toBe(200)
    expect(getOrdersMock).toHaveBeenCalledTimes(1)

    const arg = getOrdersMock.mock.calls[0][0]
    expect(arg.vendor_id).toBe('2fb2be63-52d2-45f2-8b6e-ead8d4b5f6fb')
    expect(arg.requester_role).toBe('vendor')
  })

  it('redacts customer and pricing data from vendor order list responses', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      createMockSupabase({
        user: { id: 'user-3' },
        profile: { role: 'vendor', organization_id: 'org-v1' },
      })
    )

    getOrdersMock.mockResolvedValueOnce({
      data: [
        {
          id: 'order-1',
          order_number: 'CPO-6001',
          total_amount: 1250,
          quoted_amount: 1400,
          final_amount: 1500,
          customer_id: 'customer-1',
          notes: 'Call John at 555-1111',
          internal_notes: 'Margin target 18%',
          customer: {
            company_name: 'Acme Corp',
            contact_name: 'John Doe',
            contact_email: 'john@acme.test',
          },
          items: [
            {
              id: 'item-1',
              unit_price: 250,
              quoted_price: 275,
              final_price: 300,
              pricing_metadata: { pricing_source: 'manual' },
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })

    const { GET } = await import('@/app/api/orders/route')
    const response = await GET(new NextRequest('http://localhost:3000/api/orders'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data[0]).toMatchObject({
      id: 'order-1',
      order_number: 'CPO-6001',
      total_amount: 0,
    })
    expect(json.data[0].customer_id).toBeUndefined()
    expect(json.data[0].quoted_amount).toBeUndefined()
    expect(json.data[0].final_amount).toBeUndefined()
    expect(json.data[0].notes).toBeUndefined()
    expect(json.data[0].internal_notes).toBeUndefined()
    expect(json.data[0].customer).toBeUndefined()
    expect(json.data[0].items[0].unit_price).toBeUndefined()
    expect(json.data[0].items[0].pricing_metadata).toBeNull()
  })
})
