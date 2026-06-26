import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServiceRoleClientMock = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

describe('SLAService.checkAllOrders smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns zero counts and does not throw when there are no open orders', async () => {
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })

    const { SLAService } = await import('@/services/sla.service')
    const result = await SLAService.checkAllOrders()

    expect(result).toEqual({ checked: 0, warnings: 0, breaches: 0, reminders: 0 })
  })

  it('throws a clean error (not an uncaught/raw Supabase error) when the orders query fails', async () => {
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection failed' } }),
        }),
      }),
    })

    const { SLAService } = await import('@/services/sla.service')
    await expect(SLAService.checkAllOrders()).rejects.toThrow('connection failed')
  })
})
