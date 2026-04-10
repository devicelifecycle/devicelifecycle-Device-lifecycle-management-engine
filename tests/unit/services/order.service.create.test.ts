import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServiceRoleClientMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

describe('OrderService.createOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('retries order number reservation when the generated number collides', async () => {
    const rpcMock = vi.fn()
      .mockResolvedValueOnce({ data: 'PO-2026-0001', error: null })
      .mockResolvedValueOnce({ data: 'PO-2026-0002', error: null })

    const ordersInsertMock = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: '23505',
              message: 'duplicate key value violates unique constraint "orders_order_number_key"',
            },
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'order-2',
              order_number: 'PO-2026-0002',
              status: 'draft',
              type: 'trade_in',
            },
            error: null,
          }),
        }),
      })

    const orderItemsInsertMock = vi.fn().mockResolvedValue({ error: null })
    const ordersUpdateEqMock = vi.fn().mockResolvedValue({ error: null })

    createServiceRoleClientMock.mockReturnValue({
      rpc: rpcMock,
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            insert: ordersInsertMock,
            update: vi.fn().mockReturnValue({
              eq: ordersUpdateEqMock,
            }),
          }
        }

        if (table === 'order_items') {
          return {
            insert: orderItemsInsertMock,
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { OrderService } = await import('@/services/order.service')
    const addTimelineEventSpy = vi.spyOn(OrderService as any, 'addTimelineEvent').mockResolvedValue(undefined)
    const logAuditSpy = vi.spyOn(OrderService as any, 'logAudit').mockResolvedValue(undefined)

    const order = await OrderService.createOrder(
      {
        type: 'trade_in',
        customer_id: 'customer-1',
        items: [
          {
            device_id: 'device-1',
            quantity: 2,
            storage: '128GB',
            condition: 'good',
            color: 'Black',
          },
        ],
      },
      'user-1',
      'org-1',
    )

    expect(rpcMock).toHaveBeenCalledTimes(2)
    expect(ordersInsertMock).toHaveBeenCalledTimes(2)
    expect(order.order_number).toBe('PO-2026-0002')
    expect(orderItemsInsertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        order_id: 'order-2',
        device_id: 'device-1',
        quantity: 2,
        storage: '128GB',
        colour: 'Black',
        claimed_condition: 'good',
      }),
    ])
    expect(addTimelineEventSpy).toHaveBeenCalledWith('order-2', 'Order Created', 'Order PO-2026-0002 created', 'user-1')
    expect(logAuditSpy).toHaveBeenCalled()
  })
})
