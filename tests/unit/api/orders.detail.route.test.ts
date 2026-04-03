import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getOrderByIdMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()

vi.mock('@/services/order.service', () => ({
  OrderService: {
    getOrderById: getOrderByIdMock,
  },
}))

vi.mock('@/services/notification.service', () => ({
  NotificationService: {},
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

describe('GET /api/orders/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redacts customer, notes, and pricing data for vendor order detail responses', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'vendor-user-1' },
        profile: { role: 'vendor', organization_id: 'vendor-org-1' },
      }),
    )

    getOrderByIdMock.mockResolvedValue({
      id: '7e50e74e-313e-432e-9d04-8dd5f9fa15aa',
      order_number: 'CPO-7001-A',
      type: 'cpo',
      status: 'sourced',
      customer_id: 'customer-1',
      total_amount: 1800,
      quoted_amount: 2100,
      final_amount: 2200,
      notes: 'Please call before delivery',
      internal_notes: 'Protect margin',
      customer: {
        organization_id: 'customer-org-1',
        company_name: 'Acme Corp',
        contact_name: 'Jane Doe',
        contact_email: 'jane@acme.test',
      },
      vendor: {
        organization_id: 'vendor-org-1',
        company_name: 'Best Vendor',
      },
      items: [
        {
          id: 'item-1',
          unit_price: 250,
          quoted_price: 275,
          final_price: 300,
          notes: 'VIP customer',
          pricing_metadata: { pricing_source: 'manual' },
        },
      ],
    })

    const { GET } = await import('@/app/api/orders/[id]/route')
    const response = await GET(
      new NextRequest('http://localhost:3000/api/orders/7e50e74e-313e-432e-9d04-8dd5f9fa15aa'),
      { params: { id: '7e50e74e-313e-432e-9d04-8dd5f9fa15aa' } },
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.total_amount).toBe(0)
    expect(json.customer_id).toBeUndefined()
    expect(json.quoted_amount).toBeUndefined()
    expect(json.final_amount).toBeUndefined()
    expect(json.notes).toBeUndefined()
    expect(json.internal_notes).toBeUndefined()
    expect(json.customer).toBeUndefined()
    expect(json.items[0].unit_price).toBeUndefined()
    expect(json.items[0].quoted_price).toBeUndefined()
    expect(json.items[0].final_price).toBeUndefined()
    expect(json.items[0].notes).toBeUndefined()
    expect(json.items[0].pricing_metadata).toBeNull()
  })
})
