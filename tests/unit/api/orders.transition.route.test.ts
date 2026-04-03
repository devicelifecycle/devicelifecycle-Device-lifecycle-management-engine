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
      { params: Promise.resolve({ id: 'order-1' }) },
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
      { params: Promise.resolve({ id: 'order-1' }) },
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
      { params: Promise.resolve({ id: 'order-2' }) },
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
      { params: Promise.resolve({ id: 'order-3' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Only CPO orders can be moved to sourcing',
    })
    expect(transitionOrderMock).not.toHaveBeenCalled()
  })

  it('allows accepted trade-in orders to move directly to shipped_to_coe', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'admin-2' },
        profile: { role: 'admin', organization_id: 'org-admin' },
      }),
    )

    getOrderByIdMock.mockResolvedValue({
      id: 'order-4',
      order_number: 'TI-2004',
      status: 'accepted',
      type: 'trade_in',
      customer_id: 'customer-1',
      customer: { organization_id: 'org-1' },
      vendor_id: null,
      assigned_to_id: 'staff-1',
      created_by_id: 'creator-1',
    })

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders/order-4/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_status: 'shipped_to_coe', notes: 'Customer shipped devices' }),
      }),
      { params: Promise.resolve({ id: 'order-4' }) },
    )

    expect(response.status).toBe(200)
    expect(transitionOrderMock).toHaveBeenCalledWith('order-4', 'shipped_to_coe', 'admin-2', 'Customer shipped devices')
  })

  it('allows a vendor to progress their own assigned order from sourced to shipped', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'vendor-user-1' },
        profile: { role: 'vendor', organization_id: 'vendor-org-1' },
      }),
    )

    getOrderByIdMock.mockResolvedValue({
      id: 'order-5',
      order_number: 'CPO-5001-A',
      status: 'sourced',
      type: 'cpo',
      customer_id: 'customer-1',
      customer: { organization_id: 'org-1' },
      vendor_id: 'vendor-1',
      vendor: { organization_id: 'vendor-org-1' },
      shipments: [{ id: 'shipment-1', direction: 'inbound', tracking_number: 'TRACK-1' }],
      assigned_to_id: 'staff-1',
      created_by_id: 'creator-1',
    })

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders/order-5/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_status: 'shipped', notes: 'Tracking uploaded' }),
      }),
      { params: Promise.resolve({ id: 'order-5' }) },
    )

    expect(response.status).toBe(200)
    expect(transitionOrderMock).toHaveBeenCalledWith('order-5', 'shipped', 'vendor-user-1', 'Tracking uploaded')
  })

  it('allows sales to send a quote on a submitted order', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'sales-user-1' },
        profile: { role: 'sales', organization_id: 'org-sales' },
      }),
    )

    getOrderByIdMock.mockResolvedValue({
      id: 'order-5b',
      order_number: 'TI-2005',
      status: 'submitted',
      type: 'trade_in',
      customer_id: 'customer-1',
      customer: { organization_id: 'org-1' },
      vendor_id: null,
      assigned_to_id: 'staff-1',
      created_by_id: 'creator-1',
    })

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders/order-5b/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_status: 'quoted', notes: 'Quote sent to customer' }),
      }),
      { params: Promise.resolve({ id: 'order-5b' }) },
    )

    expect(response.status).toBe(200)
    expect(transitionOrderMock).toHaveBeenCalledWith('order-5b', 'quoted', 'sales-user-1', 'Quote sent to customer')
  })

  it('blocks COE techs from sending quotes', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'coe-tech-user-1' },
        profile: { role: 'coe_tech', organization_id: 'org-coe' },
      }),
    )

    getOrderByIdMock.mockResolvedValue({
      id: 'order-5c',
      order_number: 'TI-2006',
      status: 'submitted',
      type: 'trade_in',
      customer_id: 'customer-1',
      customer: { organization_id: 'org-1' },
      vendor_id: null,
      assigned_to_id: 'staff-1',
      created_by_id: 'creator-1',
    })

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders/order-5c/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_status: 'quoted', notes: 'Should fail' }),
      }),
      { params: Promise.resolve({ id: 'order-5c' }) },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Only admin, COE managers, or sales can send quotes',
    })
    expect(transitionOrderMock).not.toHaveBeenCalled()
  })

  it('allows a vendor to progress their own assigned order through the full fulfillment lifecycle', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'vendor-user-1' },
        profile: { role: 'vendor', organization_id: 'vendor-org-1' },
      }),
    )

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const steps = [
      { from: 'accepted', to: 'sourcing', notes: 'Accepted job' },
      { from: 'sourcing', to: 'sourced', notes: 'Devices sourced' },
      { from: 'sourced', to: 'shipped', notes: 'Devices shipped' },
      { from: 'shipped', to: 'delivered', notes: 'Devices delivered' },
      { from: 'delivered', to: 'closed', notes: 'Fulfillment complete' },
    ] as const

    for (const step of steps) {
      getOrderByIdMock.mockResolvedValueOnce({
        id: 'order-6',
        order_number: 'CPO-5002-A',
        status: step.from,
        type: 'cpo',
        customer_id: 'customer-1',
        customer: { organization_id: 'org-1' },
        vendor_id: 'vendor-1',
        vendor: { organization_id: 'vendor-org-1' },
        shipments: step.from === 'sourced' || step.from === 'shipped' || step.from === 'delivered'
          ? [{ id: 'shipment-2', direction: 'inbound', tracking_number: 'TRACK-2' }]
          : [],
        assigned_to_id: 'staff-1',
        created_by_id: 'creator-1',
      })

      const response = await POST(
        new NextRequest('http://localhost:3000/api/orders/order-6/transition', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ to_status: step.to, notes: step.notes }),
        }),
        { params: Promise.resolve({ id: 'order-6' }) },
      )

      expect(response.status).toBe(200)
      expect(transitionOrderMock).toHaveBeenLastCalledWith('order-6', step.to, 'vendor-user-1', step.notes)
    }

    expect(transitionOrderMock).toHaveBeenCalledTimes(steps.length)
  })

  it('blocks vendors from transitioning orders assigned to another vendor organization', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'vendor-user-2' },
        profile: { role: 'vendor', organization_id: 'vendor-org-2' },
      }),
    )

    getOrderByIdMock.mockResolvedValue({
      id: 'order-7',
      order_number: 'CPO-5003-A',
      status: 'sourced',
      type: 'cpo',
      customer: { organization_id: 'org-1' },
      vendor_id: 'vendor-1',
      vendor: { organization_id: 'vendor-org-1' },
    })

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders/order-7/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_status: 'shipped', notes: 'Should fail' }),
      }),
      { params: Promise.resolve({ id: 'order-7' }) },
    )

    expect(response.status).toBe(403)
    expect(transitionOrderMock).not.toHaveBeenCalled()
  })

  it('blocks vendors from marking sourced orders as shipped before tracking is uploaded', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'vendor-user-3' },
        profile: { role: 'vendor', organization_id: 'vendor-org-1' },
      }),
    )

    getOrderByIdMock.mockResolvedValue({
      id: 'order-8',
      order_number: 'CPO-5004-A',
      status: 'sourced',
      type: 'cpo',
      customer: { organization_id: 'org-1' },
      vendor_id: 'vendor-1',
      vendor: { organization_id: 'vendor-org-1' },
      shipments: [],
    })

    const { POST } = await import('@/app/api/orders/[id]/transition/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders/order-8/transition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_status: 'shipped', notes: 'No tracking yet' }),
      }),
      { params: Promise.resolve({ id: 'order-8' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Upload vendor tracking before marking the order as shipped',
    })
    expect(transitionOrderMock).not.toHaveBeenCalled()
  })
})
