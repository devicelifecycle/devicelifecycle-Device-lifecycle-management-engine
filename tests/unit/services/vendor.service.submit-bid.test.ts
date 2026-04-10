import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServiceRoleClientMock = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

describe('VendorService.submitBid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('auto-accepts the first full-quantity bid on an unassigned order', async () => {
    const insertSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: 'bid-1',
        order_id: 'order-1',
        vendor_id: 'vendor-1',
        quantity: 5,
        unit_price: 120,
        total_price: 600,
        status: 'pending',
      },
      error: null,
    })

    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'vendor_bids') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: insertSingleMock,
              }),
            }),
          }
        }

        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'order-1',
                    vendor_id: null,
                    total_quantity: 5,
                  },
                  error: null,
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { VendorService } = await import('@/services/vendor.service')
    const updateBidStatusSpy = vi
      .spyOn(VendorService, 'updateBidStatus')
      .mockResolvedValue({
        id: 'bid-1',
        order_id: 'order-1',
        vendor_id: 'vendor-1',
        quantity: 5,
        unit_price: 120,
        total_price: 600,
        status: 'accepted',
      } as any)

    const result = await VendorService.submitBid({
      order_id: 'order-1',
      vendor_id: 'vendor-1',
      quantity: 5,
      unit_price: 120,
      lead_time_days: 3,
    })

    expect(updateBidStatusSpy).toHaveBeenCalledWith('bid-1', 'accepted')
    expect(result).toMatchObject({
      id: 'bid-1',
      status: 'accepted',
      auto_accepted: true,
    })
  })

  it('keeps partial bids pending when they do not cover the full order quantity', async () => {
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'vendor_bids') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'bid-2',
                    order_id: 'order-1',
                    vendor_id: 'vendor-1',
                    quantity: 2,
                    unit_price: 120,
                    total_price: 240,
                    status: 'pending',
                  },
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'order-1',
                    vendor_id: null,
                    total_quantity: 5,
                  },
                  error: null,
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { VendorService } = await import('@/services/vendor.service')
    const updateBidStatusSpy = vi
      .spyOn(VendorService, 'updateBidStatus')
      .mockResolvedValue({} as any)

    const result = await VendorService.submitBid({
      order_id: 'order-1',
      vendor_id: 'vendor-1',
      quantity: 2,
      unit_price: 120,
      lead_time_days: 3,
    })

    expect(updateBidStatusSpy).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      id: 'bid-2',
      status: 'pending',
    })
  })
})
