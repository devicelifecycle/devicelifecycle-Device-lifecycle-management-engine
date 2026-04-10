import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

type MockOrderRow = {
  id: string
  order_number: string
  status: string
  total_quantity: number
  quoted_amount: number | null
  order_items: Array<{
    id: string
    device_id: string | null
    quantity: number
    claimed_condition: string | null
    quoted_price: number | null
    storage: string | null
    actual_condition: string | null
    device: { make: string; model: string } | null
  }>
}

function makeSupabase({
  orders = [],
  catalogDevices = [],
}: {
  orders?: MockOrderRow[]
  catalogDevices?: Array<{ id: string; make: string; model: string }>
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'admin' },
              }),
            }),
          }),
        }
      }

      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              ilike: vi.fn().mockResolvedValue({ data: orders }),
              eq: vi.fn().mockResolvedValue({ data: orders }),
            }),
          }),
        }
      }

      if (table === 'device_catalog') {
        return {
          select: vi.fn().mockResolvedValue({ data: catalogDevices }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('POST /api/triage/upload-template', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('matches uploaded rows against the linked order instead of force-matching catalog devices', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        orders: [
          {
            id: 'order-1',
            order_number: 'PO-2026-0001',
            status: 'draft',
            total_quantity: 1,
            quoted_amount: 210,
            order_items: [
              {
                id: 'item-1',
                device_id: 'device-iphone-11',
                quantity: 1,
                claimed_condition: 'good',
                quoted_price: 210,
                storage: '128GB',
                actual_condition: null,
                device: { make: 'Apple', model: 'iPhone 11' },
              },
            ],
          },
        ],
        catalogDevices: [
          { id: 'device-iphone-11', make: 'Apple', model: 'iPhone 11' },
          { id: 'device-iphone-14', make: 'Apple', model: 'iPhone 14' },
        ],
      }),
    )

    const { POST } = await import('@/app/api/triage/upload-template/route')
    const form = new FormData()
    form.append(
      'file',
      new File(
        [
          [
            'IMEI,Make,Model,Storage,Condition',
            '111111111111111,Apple,iPhone 11,128GB,good',
            '222222222222222,Apple,iPhone 14,128GB,good',
          ].join('\n'),
        ],
        'triage-upload.csv',
        { type: 'text/csv' },
      ),
    )
    form.append('order_ref', 'PO-2026-0001')

    const response = await POST(
      new NextRequest('http://localhost:3000/api/triage/upload-template', {
        method: 'POST',
        body: form,
      }),
    )

    expect(response.status).toBe(200)
    const json = await response.json()

    expect(json.order?.order_number).toBe('PO-2026-0001')
    expect(json.order_matched).toBe(1)
    expect(json.not_in_order).toBe(1)
    expect(json.ready_to_import).toBe(1)
    expect(json.rows[0]).toMatchObject({
      match_status: 'matched',
      matched_item: { id: 'item-1' },
      device_id: 'device-iphone-11',
    })
    expect(json.rows[1]).toMatchObject({
      match_status: 'not_in_order',
      device_id: 'device-iphone-14',
    })
  })

  it('keeps catalog recognition separate when no order is linked', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        catalogDevices: [
          { id: 'device-iphone-11', make: 'Apple', model: 'iPhone 11' },
        ],
      }),
    )

    const { POST } = await import('@/app/api/triage/upload-template/route')
    const form = new FormData()
    form.append(
      'file',
      new File(
        [
          [
            'IMEI,Make,Model,Storage,Condition',
            '111111111111111,Apple,iPhone 11,128GB,good',
            '222222222222222,Apple,Mystery Phone,128GB,good',
          ].join('\n'),
        ],
        'triage-upload.csv',
        { type: 'text/csv' },
      ),
    )

    const response = await POST(
      new NextRequest('http://localhost:3000/api/triage/upload-template', {
        method: 'POST',
        body: form,
      }),
    )

    expect(response.status).toBe(200)
    const json = await response.json()

    expect(json.order).toBeNull()
    expect(json.catalog_matched).toBe(1)
    expect(json.not_in_catalog).toBe(1)
    expect(json.ready_to_import).toBe(1)
    expect(json.rows[0].match_status).toBe('catalog_matched')
    expect(json.rows[1].match_status).toBe('not_in_catalog')
  })
})
