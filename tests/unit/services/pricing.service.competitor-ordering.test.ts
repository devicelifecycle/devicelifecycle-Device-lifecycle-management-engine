import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

describe('PricingService.getCompetitorPrices ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sorts by device/storage/condition in excellent-good-fair-broken order', async () => {
    const rows = [
      {
        id: '4',
        device_id: 'd1',
        storage: '128GB',
        condition: 'broken',
        competitor_name: 'Bell',
        updated_at: '2026-03-06T00:00:00.000Z',
        device: { make: 'Apple', model: 'iPhone 15' },
      },
      {
        id: '2',
        device_id: 'd1',
        storage: '128GB',
        condition: 'good',
        competitor_name: 'Bell',
        updated_at: '2026-03-06T00:00:00.000Z',
        device: { make: 'Apple', model: 'iPhone 15' },
      },
      {
        id: '1',
        device_id: 'd1',
        storage: '128GB',
        condition: 'excellent',
        competitor_name: 'Bell',
        updated_at: '2026-03-06T00:00:00.000Z',
        device: { make: 'Apple', model: 'iPhone 15' },
      },
      {
        id: '3',
        device_id: 'd1',
        storage: '128GB',
        condition: 'fair',
        competitor_name: 'Bell',
        updated_at: '2026-03-06T00:00:00.000Z',
        device: { make: 'Apple', model: 'iPhone 15' },
      },
    ]

    const competitorQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (value: { data: typeof rows; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    }
    const deviceQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }

    createServerSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'device_catalog') return deviceQuery
        return competitorQuery
      }),
    })

    const { PricingService } = await import('@/services/pricing.service')
    const result = await PricingService.getCompetitorPrices('d1')

    expect(result.map((entry) => entry.condition)).toEqual([
      'excellent',
      'good',
      'fair',
      'broken',
    ])
  })

  it('fetches competitor prices across multiple Supabase pages', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `p1-${index}`,
      device_id: 'd1',
      storage: '128GB',
      condition: 'good',
      competitor_name: `Comp ${index}`,
      updated_at: '2026-03-06T00:00:00.000Z',
      device: { make: 'Apple', model: 'iPhone 15' },
    }))
    const secondPage = [
      {
        id: 'p2-1',
        device_id: 'd1',
        storage: '256GB',
        condition: 'excellent',
        competitor_name: 'Bell',
        updated_at: '2026-03-07T00:00:00.000Z',
        device: { make: 'Apple', model: 'iPhone 15' },
      },
      {
        id: 'p2-2',
        device_id: 'd1',
        storage: '512GB',
        condition: 'fair',
        competitor_name: 'Telus',
        updated_at: '2026-03-07T00:00:00.000Z',
        device: { make: 'Apple', model: 'iPhone 15' },
      },
    ]

    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === 'device_catalog') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }

      expect(table).toBe('competitor_prices')
      let start = 0

      const query = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockImplementation((from: number) => {
          start = from
          return query
        }),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then: (onfulfilled: (value: { data: typeof firstPage; error: null }) => unknown, onrejected?: (reason: unknown) => unknown) => {
          const data = start === 0 ? firstPage : secondPage
          return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)
        },
      }

      return query
    })

    createServerSupabaseClientMock.mockReturnValue({
      from: fromMock,
    })

    const { PricingService } = await import('@/services/pricing.service')
    const result = await PricingService.getCompetitorPrices('d1')

    expect(result).toHaveLength(1002)
    expect(fromMock.mock.calls.filter(([table]) => table === 'competitor_prices')).toHaveLength(2)
    expect(result.at(-1)?.storage).toBe('512GB')
  })
})
