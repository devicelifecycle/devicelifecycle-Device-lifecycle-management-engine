import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runScraperPipelineMock = vi.fn()
const createServiceRoleClientMock = vi.fn()
const sendPriceUpdateNotificationMock = vi.fn().mockResolvedValue(undefined)
const runPostScrapeCleanupMock = vi.fn()
const auditCompetitorPricesHealthMock = vi.fn()

vi.mock('@/lib/scrapers', () => ({
  runScraperPipeline: runScraperPipelineMock,
}))

vi.mock('@/lib/scrapers/post-scrape', () => ({
  runPostScrapeCleanup: runPostScrapeCleanupMock,
}))

vi.mock('@/lib/scrapers/health-audit', () => ({
  auditCompetitorPricesHealth: auditCompetitorPricesHealthMock,
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
    // Set scraper implementations for rollout metadata test
    ;(process.env as Record<string, string | undefined>).SCRAPER_UNIVERCELL_IMPL = 'scrapling'
    ;(process.env as Record<string, string | undefined>).SCRAPER_APPLE_IMPL = 'ts'
    ;(process.env as Record<string, string | undefined>).SCRAPER_BELL_IMPL = 'ts'
    ;(process.env as Record<string, string | undefined>).SCRAPER_GORECELL_IMPL = 'ts'
    ;(process.env as Record<string, string | undefined>).SCRAPER_TELUS_IMPL = 'ts'

    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert: upsertMock }),
    })

    runPostScrapeCleanupMock.mockResolvedValue({
      deleted: 0,
      seeded: 0,
      errors: [],
    })

    auditCompetitorPricesHealthMock.mockResolvedValue({
      checked_at: '2026-04-14T00:00:00.000Z',
      total_rows: 7493,
      distinct_conflict_keys: 7493,
      duplicate_key_groups: 0,
      duplicate_extra_rows: 0,
      stale_non_manual_rows_older_than_14_days: 0,
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
    expect(json.data_health).toMatchObject({
      duplicate_extra_rows: 0,
      duplicate_key_groups: 0,
      stale_non_manual_rows_older_than_14_days: 0,
    })
    expect(runScraperPipelineMock).toHaveBeenCalledWith(
      undefined,
      expect.any(Object),
      false,
      undefined
    )

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
