import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

function createPagedQuery<T>(rows: T[]) {
  let from = 0
  let to = rows.length - 1

  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockImplementation((nextFrom: number, nextTo: number) => {
      from = nextFrom
      to = nextTo
      return query
    }),
    then: (onfulfilled: (value: { data: T[]; error: null }) => unknown, onrejected?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: rows.slice(from, to + 1), error: null }).then(onfulfilled, onrejected),
  }

  return query
}

function createMockSupabase() {
  const devices = [{ id: 'd1', make: 'Apple', model: 'iPhone 15', category: 'phone' }]
  const baselines = Array.from({ length: 1001 }, (_, index) => ({
    device_id: 'd1',
    storage: `${index + 1}GB`,
    condition: 'good',
    median_trade_price: 100 + index,
    sample_count: 1,
    data_sources: ['competitor_prices'],
  }))
  const marketPrices = [{ device_id: 'd1', storage: '128GB', wholesale_c_stock: 250, trade_price: 200 }]
  const pricingTables = [{ device_id: 'd1', condition: 'good', storage: '128GB', base_price: 275 }]
  const competitorPrices = Array.from({ length: 1002 }, () => ({ device_id: 'd1' }))

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: 'admin' } }),
            }),
          }),
        }
      }

      if (table === 'device_catalog') return createPagedQuery(devices)
      if (table === 'trained_pricing_baselines') return createPagedQuery(baselines)
      if (table === 'market_prices') return createPagedQuery(marketPrices)
      if (table === 'pricing_tables') return createPagedQuery(pricingTables)
      if (table === 'competitor_prices') return createPagedQuery(competitorPrices)

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('GET /api/pricing/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aggregates all pages instead of stopping at the first 1000 rows', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase())

    const { GET } = await import('@/app/api/pricing/catalog/route')
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.summary.total_devices).toBe(1)
    expect(json.summary.total_baselines).toBe(1001)
    expect(json.summary.total_competitor_entries).toBe(1002)
    expect(json.data[0].device_count).toBe(1)
    expect(json.data[0].total_baselines).toBe(1001)
    expect(json.data[0].total_competitor_entries).toBe(1002)
  })
})
