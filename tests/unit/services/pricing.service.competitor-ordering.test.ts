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

    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (value: { data: typeof rows; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    }

    createServerSupabaseClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue(query),
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
})
