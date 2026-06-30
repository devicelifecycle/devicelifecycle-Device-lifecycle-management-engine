import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServiceRoleClientMock = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

/** Build a mock Supabase client that handles the two queries checkAllOrders now makes:
 *  1. sla_rules:  .select('*').eq('is_active', true) → data (array)
 *  2. orders:     .select('*').not(...)              → data (array)
 */
function buildMock({
  rulesResult = { data: [], error: null },
  ordersResult = { data: [], error: null },
}: {
  rulesResult?: { data: unknown[] | null; error: { message: string } | null }
  ordersResult?: { data: unknown[] | null; error: { message: string } | null }
} = {}) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'sla_rules') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(rulesResult),
          }),
        }
      }
      // 'orders' table — uses .select().not() chain
      return {
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue(ordersResult),
        }),
      }
    }),
  }
}

describe('SLAService.checkAllOrders smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns zero counts and does not throw when there are no open orders', async () => {
    createServiceRoleClientMock.mockReturnValue(buildMock())

    const { SLAService } = await import('@/services/sla.service')
    const result = await SLAService.checkAllOrders()

    expect(result).toEqual({ checked: 0, warnings: 0, breaches: 0, reminders: 0 })
  })

  it('throws a clean error (not an uncaught/raw Supabase error) when the orders query fails', async () => {
    createServiceRoleClientMock.mockReturnValue(
      buildMock({ ordersResult: { data: null, error: { message: 'connection failed' } } })
    )

    const { SLAService } = await import('@/services/sla.service')
    await expect(SLAService.checkAllOrders()).rejects.toThrow('connection failed')
  })

  it('also throws a clean error when the sla_rules prefetch fails', async () => {
    createServiceRoleClientMock.mockReturnValue(
      buildMock({ rulesResult: { data: null, error: { message: 'rules query failed' } } })
    )

    const { SLAService } = await import('@/services/sla.service')
    await expect(SLAService.checkAllOrders()).rejects.toThrow('Failed to load SLA rules')
  })
})
