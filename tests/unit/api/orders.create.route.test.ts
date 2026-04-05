import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createOrderMock = vi.fn()
const sendOrderConfirmationEmailMock = vi.fn()
const sendSMSMock = vi.fn()
const isTwilioConfiguredMock = vi.fn()
const createNotificationMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()
const createServiceRoleClientMock = vi.fn()

vi.mock('@/services/order.service', () => ({
  OrderService: {
    createOrder: createOrderMock,
  },
}))

vi.mock('@/services/email.service', () => ({
  EmailService: {
    sendOrderConfirmationEmail: sendOrderConfirmationEmailMock,
    sendSMS: sendSMSMock,
    isTwilioConfigured: isTwilioConfiguredMock,
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

function makeQuery({
  singleResult,
  listResult,
}: {
  singleResult?: (filters: Record<string, unknown>, selectClause?: string) => unknown
  listResult?: (filters: Record<string, unknown>, selectClause?: string) => unknown
}) {
  const filters: Record<string, unknown> = {}
  let selectClause = ''

  const query: any = {
    select: vi.fn().mockImplementation((value: string) => {
      selectClause = value
      return query
    }),
    eq: vi.fn().mockImplementation((field: string, value: unknown) => {
      filters[field] = value
      return query
    }),
    single: vi.fn().mockImplementation(async () => ({
      data: singleResult ? singleResult(filters, selectClause) : null,
      error: null,
    })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({
        data: listResult ? listResult(filters, selectClause) : [],
        error: null,
      }).then(resolve, reject),
  }

  return query
}

function makeServerSupabase(profile = {
  role: 'sales',
  organization_id: '22222222-2222-2222-2222-222222222222',
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: '11111111-1111-1111-1111-111111111111' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return makeQuery({
          singleResult: () => profile,
        })
      }

      if (table === 'customers') {
        return makeQuery({
          singleResult: (_filters, selectClause) => {
            if (selectClause?.includes('contact_email')) {
              return {
                contact_email: 'buyer@example.com',
                contact_name: 'Buyer Contact',
                contact_phone: '+15555550123',
              }
            }

            return {
              id: '33333333-3333-3333-3333-333333333333',
              organization_id: '44444444-4444-4444-4444-444444444444',
            }
          },
        })
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function makeServiceRoleSupabase() {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return makeQuery({
          listResult: (filters) => {
            if (filters.role === 'admin') {
              return [{ id: '55555555-5555-5555-5555-555555555555' }]
            }

            if (filters.organization_id === '44444444-4444-4444-4444-444444444444') {
              return [{ id: '66666666-6666-6666-6666-666666666666' }]
            }

            return []
          },
        })
      }

      if (table === 'customers') {
        return makeQuery({
          singleResult: () => ({
            organization_id: '44444444-4444-4444-4444-444444444444',
            company_name: 'Acme Devices',
          }),
        })
      }

      throw new Error(`Unexpected service-role table: ${table}`)
    }),
  }
}

describe('POST /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    createServerSupabaseClientMock.mockReturnValue(makeServerSupabase())
    createServiceRoleClientMock.mockReturnValue(makeServiceRoleSupabase())

    createOrderMock.mockResolvedValue({
      id: '77777777-7777-7777-7777-777777777777',
      order_number: 'TI-1001',
      status: 'draft',
    })
    sendOrderConfirmationEmailMock.mockResolvedValue(true)
    sendSMSMock.mockResolvedValue(true)
    isTwilioConfiguredMock.mockReturnValue(false)
    createNotificationMock.mockResolvedValue({ id: 'notif-1' })
  })

  it('creates an order and fans out admin and customer notifications', async () => {
    const { POST } = await import('@/app/api/orders/route')

    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'trade_in',
          customer_id: '33333333-3333-3333-3333-333333333333',
          items: [
            {
              device_id: '88888888-8888-8888-8888-888888888888',
              quantity: 2,
              storage: '256GB',
              condition: 'good',
              color: 'Blue',
            },
          ],
          notes: 'Customer requested quick turnaround',
        }),
      }),
    )

    expect(response.status).toBe(201)
    expect(createOrderMock).toHaveBeenCalledTimes(1)
    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trade_in',
        customer_id: '33333333-3333-3333-3333-333333333333',
        customer_notes: 'Customer requested quick turnaround',
      }),
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sendOrderConfirmationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        recipientName: 'Buyer Contact',
        orderNumber: 'TI-1001',
        orderId: '77777777-7777-7777-7777-777777777777',
        itemCount: 1,
      }),
    )

    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: '55555555-5555-5555-5555-555555555555',
        title: 'New Order #TI-1001 Created',
        metadata: expect.objectContaining({
          order_id: '77777777-7777-7777-7777-777777777777',
          audience: 'admin',
        }),
      }),
    )

    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Order #TI-1001 Received',
        link: '/orders/77777777-7777-7777-7777-777777777777',
        metadata: expect.objectContaining({
          event: 'order_created',
          audience: 'customer',
        }),
      }),
    )
  })

  it('blocks vendors from creating orders', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeServerSupabase({
        role: 'vendor',
        organization_id: '99999999-9999-9999-9999-999999999999',
      }),
    )

    const { POST } = await import('@/app/api/orders/route')

    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'cpo',
          customer_id: '33333333-3333-3333-3333-333333333333',
          items: [
            {
              device_id: '88888888-8888-8888-8888-888888888888',
              quantity: 1,
              storage: '128GB',
              condition: 'good',
            },
          ],
        }),
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Vendors cannot create orders',
    })
    expect(createOrderMock).not.toHaveBeenCalled()
  })

  it('blocks sales from creating CPO orders', async () => {
    const { POST } = await import('@/app/api/orders/route')

    const response = await POST(
      new NextRequest('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'cpo',
          customer_id: '33333333-3333-3333-3333-333333333333',
          items: [
            {
              device_id: '88888888-8888-8888-8888-888888888888',
              quantity: 5,
              storage: '128GB',
              condition: 'good',
            },
          ],
        }),
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Sales can create trade-in orders only',
    })
    expect(createOrderMock).not.toHaveBeenCalled()
  })
})
