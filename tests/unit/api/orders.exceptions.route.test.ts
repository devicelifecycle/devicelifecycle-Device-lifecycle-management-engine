import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()
const getOrderByIdMock = vi.fn()
const getPendingExceptionsForOrderMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/services/order.service', () => ({
  OrderService: {
    getOrderById: getOrderByIdMock,
  },
}))

vi.mock('@/services/triage.service', () => ({
  TriageService: {
    getPendingExceptionsForOrder: getPendingExceptionsForOrderMock,
  },
}))

function makeSupabase({
  user,
  profile,
}: {
  user: { id: string } | null
  profile: { role?: string; organization_id?: string } | null
}) {
  return {
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
  }
}

describe('GET /api/orders/[id]/exceptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    getPendingExceptionsForOrderMock.mockResolvedValue([{ id: 'triage-1' }])
  })

  it('returns pending exceptions to a customer from the owning organization', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'customer-user-1' },
        profile: { role: 'customer', organization_id: 'org-1' },
      }),
    )
    getOrderByIdMock.mockResolvedValue({
      id: 'order-1',
      customer: { organization_id: 'org-1' },
    })

    const { GET } = await import('@/app/api/orders/[id]/exceptions/route')
    const response = await GET(
      new NextRequest('http://localhost:3000/api/orders/order-1/exceptions'),
      { params: { id: 'order-1' } },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: [{ id: 'triage-1' }] })
    expect(getPendingExceptionsForOrderMock).toHaveBeenCalledWith('order-1')
  })

  it('forbids customers from another organization', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'customer-user-2' },
        profile: { role: 'customer', organization_id: 'org-1' },
      }),
    )
    getOrderByIdMock.mockResolvedValue({
      id: 'order-2',
      customer: { organization_id: 'org-2' },
    })

    const { GET } = await import('@/app/api/orders/[id]/exceptions/route')
    const response = await GET(
      new NextRequest('http://localhost:3000/api/orders/order-2/exceptions'),
      { params: { id: 'order-2' } },
    )

    expect(response.status).toBe(403)
    expect(getPendingExceptionsForOrderMock).not.toHaveBeenCalled()
  })
})
