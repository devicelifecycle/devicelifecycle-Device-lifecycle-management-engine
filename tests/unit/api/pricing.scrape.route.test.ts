import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const createServerSupabaseClientMock = vi.fn()
const createServiceRoleClientMock = vi.fn()
const runScraperPipelineMock = vi.fn()
const trainMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

vi.mock('@/lib/scrapers', () => ({
  runScraperPipeline: runScraperPipelineMock,
}))

vi.mock('@/services/pricing-training.service', () => ({
  PricingTrainingService: {
    train: trainMock,
  },
}))

function makeSupabase({ user, role }: { user: { id: string } | null; role?: string | null }) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== 'users') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: role ? { role } : null }),
          }),
        }),
      }
    }),
  }
}

describe('POST /api/pricing/scrape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for unauthenticated users', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: null }))

    const { POST } = await import('@/app/api/pricing/scrape/route')
    const response = await POST(new NextRequest('http://localhost/api/pricing/scrape', { method: 'POST' }))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 for users without pricing permissions', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'u1' }, role: 'sales' }))

    const { POST } = await import('@/app/api/pricing/scrape/route')
    const response = await POST(new NextRequest('http://localhost/api/pricing/scrape', { method: 'POST' }))
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json).toEqual({ error: 'Forbidden' })
  })

  it('returns structured JSON on success and skips inline training by default', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'u1' }, role: 'admin' }))
    createServiceRoleClientMock.mockReturnValue({ kind: 'service' })
    runScraperPipelineMock.mockResolvedValue({
      total_scraped: 20,
      total_upserted: 12,
      devices_created: 3,
      errors: [],
      results: [
        { competitor_name: 'Bell', success: true, prices: [{}, {}], duration_ms: 1234 },
      ],
    })
    const { POST } = await import('@/app/api/pricing/scrape/route')
    const response = await POST(new NextRequest('http://localhost/api/pricing/scrape', { method: 'POST' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.total_scraped).toBe(20)
    expect(json.total_upserted).toBe(12)
    expect(json.devices_created).toBe(3)
    expect(json.scrapers).toEqual([
      { name: 'Bell', success: true, count: 2, duration_ms: 1234 },
    ])
    expect(json.training).toEqual({
      skipped: true,
      reason: 'Manual scrape skips synchronous training. Run training from the Training Data tab or POST /api/pricing/train.',
    })
    expect(trainMock).not.toHaveBeenCalled()
  })

  it('can opt into inline training explicitly', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'u1' }, role: 'admin' }))
    createServiceRoleClientMock.mockReturnValue({ kind: 'service' })
    runScraperPipelineMock.mockResolvedValue({
      total_scraped: 20,
      total_upserted: 12,
      devices_created: 3,
      errors: [],
      results: [],
    })
    trainMock.mockResolvedValue({
      baselines_upserted: 42,
      sample_counts: {
        order_items: 1,
        imei_records: 0,
        sales_history: 0,
        market_prices: 5,
        competitor_prices: 10,
        training_data: 0,
      },
    })

    const { POST } = await import('@/app/api/pricing/scrape/route')
    const response = await POST(new NextRequest('http://localhost/api/pricing/scrape?include_training=true', { method: 'POST' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.training).toEqual({
      baselines_upserted: 42,
      sample_counts: {
        order_items: 1,
        imei_records: 0,
        sales_history: 0,
        market_prices: 5,
        competitor_prices: 10,
        training_data: 0,
      },
    })
    expect(trainMock).toHaveBeenCalledTimes(1)
  })

  it('returns structured JSON on scraper failure', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'u1' }, role: 'admin' }))
    createServiceRoleClientMock.mockImplementation(() => {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for service-role client')
    })

    const { POST } = await import('@/app/api/pricing/scrape/route')
    const response = await POST(new NextRequest('http://localhost/api/pricing/scrape', { method: 'POST' }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Scraper failed')
  })
})
