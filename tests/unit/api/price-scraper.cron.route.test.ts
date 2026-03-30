import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runScraperPipelineMock = vi.fn()
const createServiceRoleClientMock = vi.fn()
const sendPriceUpdateNotificationMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/scrapers', () => ({
  runScraperPipeline: runScraperPipelineMock,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

vi.mock('@/services/notification.service', () => ({
  NotificationService: {
    sendPriceUpdateNotification: sendPriceUpdateNotificationMock,
  },
}))

describe('GET /api/cron/price-scraper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ;(process.env as Record<string, string | undefined>).CRON_SECRET = ' secret123 \n'
    ;(process.env as Record<string, string | undefined>).PRICE_SCRAPER_ENABLED = ' true \n'
    ;(process.env as Record<string, string | undefined>).PRICE_SCRAPER_AUTO_TRAINING = ' false \n'

    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert: upsertMock }),
    })

    runScraperPipelineMock.mockResolvedValue({
      total_scraped: 12,
      total_upserted: 10,
      devices_created: 1,
      results: [
        {
          competitor_name: 'UniverCell',
          success: true,
          duration_ms: 1200,
          prices: [
            {
              competitor_name: 'UniverCell',
              make: 'Apple',
              model: 'iPhone 15',
              storage: '128GB',
              trade_in_price: 410,
              condition: 'good',
              scraped_at: '2026-03-06T10:00:00.000Z',
              raw: { source: 'https://univercell.ai/' },
            },
          ],
        },
      ],
      errors: [],
    })
  })

  it('returns 401 when auth is invalid', async () => {
    const { GET } = await import('@/app/api/cron/price-scraper/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/price-scraper', {
      headers: { authorization: 'Bearer wrong' },
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('runs scraper and persists rollout metadata with current provider defaults', async () => {
    const { GET } = await import('@/app/api/cron/price-scraper/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/price-scraper', {
      headers: { authorization: 'Bearer secret123' },
    }))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.total_scraped).toBe(12)
    expect(json.total_upserted).toBe(10)
    expect(json.partial_failure).toBe(false)
    expect(json.failed_scrapers).toEqual([])

    const supabase = createServiceRoleClientMock.mock.results[0].value as {
      from: ReturnType<typeof vi.fn>
    }
    const upsertMock = (supabase.from.mock.results[0].value as { upsert: ReturnType<typeof vi.fn> }).upsert
    expect(upsertMock).toHaveBeenCalledTimes(2)

    const [universalPayload] = upsertMock.mock.calls[0]
    expect(universalPayload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ setting_key: 'last_universal_source_url', setting_value: 'https://univercell.ai/' }),
        expect.objectContaining({ setting_key: 'last_universal_source_status', setting_value: 'success' }),
        expect.objectContaining({ setting_key: 'last_universal_source_fallback_used', setting_value: 'false' }),
      ])
    )

    const [rolloutPayload] = upsertMock.mock.calls[1]
    expect(rolloutPayload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ setting_key: 'last_scraper_rollout_partial_failure', setting_value: 'false' }),
        expect.objectContaining({ setting_key: 'last_bell_scraper_status', setting_value: 'failed' }),
        expect.objectContaining({ setting_key: 'last_universal_scraper_status', setting_value: 'success' }),
        expect.objectContaining({ setting_key: 'last_universal_scraper_persisted_impl', setting_value: 'scrapling' }),
        expect.objectContaining({ setting_key: 'last_universal_scraper_configured_impl', setting_value: 'scrapling' }),
      ])
    )
  })

  it('skips cleanly when the enabled flag contains false with whitespace', async () => {
    ;(process.env as Record<string, string | undefined>).PRICE_SCRAPER_ENABLED = ' false \n'

    const { GET } = await import('@/app/api/cron/price-scraper/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/price-scraper', {
      headers: { authorization: 'Bearer secret123' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
    })
    expect(runScraperPipelineMock).not.toHaveBeenCalled()
  })
})
