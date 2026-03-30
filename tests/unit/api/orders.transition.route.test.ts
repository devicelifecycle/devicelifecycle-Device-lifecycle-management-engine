import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getOrderByIdMock = vi.fn()
const isValidTransitionMock = vi.fn()
const transitionOrderMock = vi.fn()
const logStatusChangeMock = vi.fn()
const sendOrderTransitionNotificationsMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()

vi.mock('@/services/order.service', () => ({
  OrderService: {
    getOrderById: getOrderByIdMock,
    isValidTransition: isValidTransitionMock,
    transitionOrder: transitionOrderMock,
  },
}))

vi.mock('@/services/audit.service', () => ({
  AuditService: {
    logStatusChange: logStatusChangeMock,
  },
}))

vi.mock('@/services/notification.service', () => ({
  NotificationService: {
    sendOrderTransitionNotifications: sendOrderTransitionNotificationsMock,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
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

describe('POST /api/orders/[id]/transition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    isValidTransitionMock.mockReturnValue(true)
    transitionOrderMock.mockResolvedValue({ id: 'order-1', status: 'accepted' })
    logStatusChangeMock.mockResolvedValue(undefined)
    sendOrderTransitionNotificationsMock.mockResolvedValue(undefined)
  })

  it('returns 401 when unauthenticated', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({ user: null, profile: null }),
    )

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders/order-1/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_status: 'accepted' }),
      }),
      { params: { id: 'order-1' } },
    )

    expect(response.status).toBe(401)
    expect(transitionOrderMock).not.toHaveBeenCalled()
  })

  it('lets a customer accept their own quote and triggers notifications', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'user-1' },
        profile: { role: 'customer', organization_id: 'org-1' },
      }),
    )

    getOrderByIdMock.mockResolvedValue({
      id: 'order-1',
      order_number: 'TI-2001',
      status: 'quoted',
      type: 'trade_in',
      customer_id: 'customer-1',
      customer: { organization_id: 'org-1' },
      vendor_id: null,
      assigned_to_id: 'staff-1',
      created_by_id: 'creator-1',
    })

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders/order-1/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_status: 'accepted', notes: 'Looks good' }),
      }),
      { params: { id: 'order-1' } },
    )

    expect(response.status).toBe(200)
    expect(transitionOrderMock).toHaveBeenCalledWith('order-1', 'accepted', 'user-1', 'Looks good')
    expect(logStatusChangeMock).toHaveBeenCalledWith(
      'user-1',
      'order',
      'order-1',
      'quoted',
      'accepted',
      expect.objectContaining({ order_number: 'TI-2001', notes: 'Looks good' }),
    )
    expect(sendOrderTransitionNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'order-1',
        order_number: 'TI-2001',
        customer_id: 'customer-1',
        assigned_to_id: 'staff-1',
      }),
      'quoted',
      'accepted',
    )
  })

  it('blocks customers from acting on another organization order', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'user-2' },
        profile: { role: 'customer', organization_id: 'org-1' },
      }),
    )

    getOrderByIdMock.mockResolvedValue({
      id: 'order-2',
      order_number: 'TI-2002',
      status: 'quoted',
      type: 'trade_in',
      customer: { organization_id: 'org-2' },
    })

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders/order-2/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_status: 'rejected' }),
      }),
      { params: { id: 'order-2' } },
    )

    expect(response.status).toBe(403)
    expect(transitionOrderMock).not.toHaveBeenCalled()
  })

  it('rejects sourcing transitions for non-CPO orders', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'admin-1' },
        profile: { role: 'admin', organization_id: 'org-admin' },
      }),
    )

    getOrderByIdMock.mockResolvedValue({
      id: 'order-3',
      order_number: 'TI-2003',
      status: 'submitted',
      type: 'trade_in',
      customer: { organization_id: 'org-1' },
    })

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders/order-3/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_status: 'sourcing' }),
      }),
      { params: { id: 'order-3' } },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Only CPO orders can be moved to sourcing',
    })
    expect(transitionOrderMock).not.toHaveBeenCalled()
  })
})
