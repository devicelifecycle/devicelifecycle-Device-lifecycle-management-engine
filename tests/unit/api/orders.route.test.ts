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
})
