import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateBidStatusMock = vi.fn()
const transitionOrderMock = vi.fn()
const createNotificationMock = vi.fn()
const sendOrderStatusEmailMock = vi.fn()
const sendSMSMock = vi.fn()
const isTwilioConfiguredMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()

vi.mock('@/services/vendor.service', () => ({
  VendorService: {
    updateBidStatus: updateBidStatusMock,
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

vi.mock('@/services/email.service', () => ({
  EmailService: {
    sendOrderStatusEmail: sendOrderStatusEmailMock,
    sendSMS: sendSMSMock,
    isTwilioConfigured: isTwilioConfiguredMock,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
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

function makeSupabase() {
  const order = {
    id: '77777777-7777-7777-7777-777777777777',
    order_number: 'CPO-3001',
    status: 'sourcing',
    type: 'cpo',
    customer_id: '33333333-3333-3333-3333-333333333333',
    vendor_id: '22222222-2222-2222-2222-222222222222',
    total_amount: 360,
    quoted_amount: 360,
  }

  const vendor = {
    id: '22222222-2222-2222-2222-222222222222',
    company_name: 'Northwind Vendor',
    contact_email: 'vendor@example.com',
    contact_phone: '+15555550111',
    contact_name: 'Vendor Contact',
    organization_id: 'vendor-org',
  }

  const customer = {
    contact_email: 'customer@example.com',
    contact_phone: '+15555550222',
    contact_name: 'Customer Contact',
    company_name: 'Acme Devices',
    organization_id: 'customer-org',
  }

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-user' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return makeQuery({
          singleResult: () => ({ role: 'admin' }),
          listResult: (filters) => {
            if (filters.organization_id === 'vendor-org') {
              return [
                {
                  id: 'vendor-user-1',
                  email: 'vendor.user@example.com',
                  full_name: 'Vendor User',
                  notification_email: null,
                },
              ]
            }

            if (filters.organization_id === 'customer-org') {
              return [{ id: 'customer-user-1' }]
            }

            return []
          },
        })
      }

      if (table === 'orders') {
        return makeQuery({
          singleResult: () => order,
        })
      }

      if (table === 'vendors') {
        return makeQuery({
          singleResult: () => vendor,
        })
      }

      if (table === 'customers') {
        return makeQuery({
          singleResult: () => customer,
        })
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('PATCH /api/vendors/bids/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    createServerSupabaseClientMock.mockReturnValue(makeSupabase())
    updateBidStatusMock.mockResolvedValue({
      id: 'bid-1',
      order_id: '77777777-7777-7777-7777-777777777777',
      vendor_id: '22222222-2222-2222-2222-222222222222',
      unit_price: 100,
      quantity: 3,
      total_price: 300,
    })
    transitionOrderMock.mockResolvedValue({ id: '77777777-7777-7777-7777-777777777777', status: 'quoted' })
    createNotificationMock.mockResolvedValue({ id: 'notif-1' })
    sendOrderStatusEmailMock.mockResolvedValue(true)
    sendSMSMock.mockResolvedValue(true)
    isTwilioConfiguredMock.mockReturnValue(true)
  })

  it('accepts a vendor bid, transitions the order to quoted, and notifies vendor and customer', async () => {
    const { PATCH } = await import('@/app/api/vendors/bids/[id]/route')

    const response = await PATCH(
      new NextRequest('http://localhost:3000/api/vendors/bids/bid-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'accepted', cpo_markup_percent: 20 }),
      }),
      { params: { id: 'bid-1' } },
    )

    expect(response.status).toBe(200)
    expect(updateBidStatusMock).toHaveBeenCalledWith('bid-1', 'accepted', 20)
    expect(transitionOrderMock).toHaveBeenCalledWith(
      '77777777-7777-7777-7777-777777777777',
      'quoted',
      'admin-user',
      'Vendor bid accepted — quote generated for customer',
    )

    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'vendor-user-1',
        title: 'Bid Accepted — Order #CPO-3001',
        link: '/vendor/orders',
      }),
    )

    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'customer-user-1',
        title: 'Quote Ready — Order #CPO-3001',
        metadata: expect.objectContaining({ type: 'cpo_quote_ready' }),
      }),
    )

    expect(sendOrderStatusEmailMock).toHaveBeenCalledTimes(2)
    expect(sendSMSMock).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid status values before touching vendor logic', async () => {
    const { PATCH } = await import('@/app/api/vendors/bids/[id]/route')

    const response = await PATCH(
      new NextRequest('http://localhost:3000/api/vendors/bids/bid-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      }),
      { params: { id: 'bid-1' } },
    )

    expect(response.status).toBe(400)
    expect(updateBidStatusMock).not.toHaveBeenCalled()
  })
})
