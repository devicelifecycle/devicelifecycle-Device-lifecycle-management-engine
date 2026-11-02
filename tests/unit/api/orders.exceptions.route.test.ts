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
  const session = user ? { user, access_token: 'mock-token' } : null
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      for (const m of ['select', 'eq', 'is', 'neq', 'order', 'limit']) chain[m] = vi.fn(self)
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null })

      if (table === 'users') {
        chain.single = vi.fn().mockResolvedValue({ data: profile })
      } else if (table === 'impersonation_log') {
        chain.single = vi.fn().mockResolvedValue({ data: null })
      } else {
        throw new Error(`Unexpected table: ${table}`)
      }

      return chain
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
      { params: Promise.resolve({ id: 'order-1' }) },
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
      { params: Promise.resolve({ id: 'order-2' }) },
    )

    expect(response.status).toBe(403)
    expect(getPendingExceptionsForOrderMock).not.toHaveBeenCalled()
  })
})
