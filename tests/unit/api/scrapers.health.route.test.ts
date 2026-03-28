import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

describe('GET /api/health/scrapers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for unauthenticated user', async () => {
    createServerSupabaseClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const { GET } = await import('@/app/api/health/scrapers/route')
    const response = await GET()

    expect(response.status).toBe(401)
  })

  it('returns aggregate rollout health for internal user', async () => {
    const settingsRows = [
      { setting_key: 'last_scraper_rollout_at', setting_value: '2026-03-26T10:00:00.000Z' },
      { setting_key: 'last_scraper_rollout_partial_failure', setting_value: 'false' },
      { setting_key: 'last_apple_scraper_status', setting_value: 'success' },
      { setting_key: 'last_apple_scraper_count', setting_value: '4' },
      { setting_key: 'last_apple_scraper_duration_ms', setting_value: '180' },
      { setting_key: 'last_apple_scraper_at', setting_value: '2026-03-26T10:00:00.000Z' },
      { setting_key: 'last_apple_scraper_configured_impl', setting_value: 'dual' },
      { setting_key: 'last_apple_scraper_persisted_impl', setting_value: 'ts' },
      { setting_key: 'last_apple_scraper_error', setting_value: '' },
      { setting_key: 'last_bell_scraper_status', setting_value: 'success' },
      { setting_key: 'last_bell_scraper_count', setting_value: '816' },
      { setting_key: 'last_bell_scraper_duration_ms', setting_value: '1200' },
      { setting_key: 'last_bell_scraper_at', setting_value: '2026-03-26T10:00:00.000Z' },
      { setting_key: 'last_bell_scraper_configured_impl', setting_value: 'scrapling' },
      { setting_key: 'last_bell_scraper_persisted_impl', setting_value: 'scrapling' },
      { setting_key: 'last_bell_scraper_error', setting_value: '' },
      { setting_key: 'last_gorecell_scraper_status', setting_value: 'success' },
      { setting_key: 'last_gorecell_scraper_count', setting_value: '5188' },
      { setting_key: 'last_gorecell_scraper_duration_ms', setting_value: '4200' },
      { setting_key: 'last_gorecell_scraper_at', setting_value: '2026-03-26T10:00:00.000Z' },
      { setting_key: 'last_gorecell_scraper_configured_impl', setting_value: 'ts' },
      { setting_key: 'last_gorecell_scraper_persisted_impl', setting_value: 'ts' },
      { setting_key: 'last_gorecell_scraper_error', setting_value: '' },
      { setting_key: 'last_telus_scraper_status', setting_value: 'success' },
      { setting_key: 'last_telus_scraper_count', setting_value: '212' },
      { setting_key: 'last_telus_scraper_duration_ms', setting_value: '2200' },
      { setting_key: 'last_telus_scraper_at', setting_value: '2026-03-26T10:00:00.000Z' },
      { setting_key: 'last_telus_scraper_configured_impl', setting_value: 'dual' },
      { setting_key: 'last_telus_scraper_persisted_impl', setting_value: 'ts' },
      { setting_key: 'last_telus_scraper_error', setting_value: '' },
      { setting_key: 'last_universal_scraper_status', setting_value: 'success' },
      { setting_key: 'last_universal_scraper_count', setting_value: '4976' },
      { setting_key: 'last_universal_scraper_duration_ms', setting_value: '3300' },
      { setting_key: 'last_universal_scraper_at', setting_value: '2026-03-26T10:00:00.000Z' },
      { setting_key: 'last_universal_scraper_configured_impl', setting_value: 'dual' },
      { setting_key: 'last_universal_scraper_persisted_impl', setting_value: 'ts' },
      { setting_key: 'last_universal_scraper_error', setting_value: '' },
      { setting_key: 'last_universal_source_url', setting_value: 'https://univercell.ai/' },
      { setting_key: 'last_universal_source_at', setting_value: '2026-03-26T10:00:00.000Z' },
      { setting_key: 'last_universal_source_status', setting_value: 'success' },
      { setting_key: 'last_universal_source_fallback_used', setting_value: 'false' },
    ]

    const settingsQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: settingsRows, error: null }),
    }

    createServerSupabaseClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { role: 'admin' } }),
          }
        }
        if (table === 'pricing_settings') {
          return settingsQuery
        }
        return null
      }),
    })

    const { GET } = await import('@/app/api/health/scrapers/route')
    const response = await GET()

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.partial_failure).toBe(false)
    expect(json.providers).toHaveLength(5)
    expect(json.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'apple',
          configured_impl: 'dual',
          persisted_impl: 'ts',
          count: 4,
        }),
        expect.objectContaining({
          id: 'bell',
          configured_impl: 'scrapling',
          persisted_impl: 'scrapling',
          count: 816,
        }),
      ])
    )
    expect(json.universal_source.source_url).toBe('https://univercell.ai/')
    expect(json.universal_source.fallback_used).toBe(false)
  })
})
