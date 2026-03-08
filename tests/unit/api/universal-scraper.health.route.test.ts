import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

describe('GET /api/health/scrapers/universal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for unauthenticated user', async () => {
    createServerSupabaseClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const { GET } = await import('@/app/api/health/scrapers/universal/route')
    const response = await GET()

    expect(response.status).toBe(401)
  })

  it('returns health payload for internal user', async () => {
    const settingsRows = [
      { setting_key: 'last_universal_source_url', setting_value: 'https://univercell.ai/' },
      { setting_key: 'last_universal_source_at', setting_value: '2026-03-06T10:00:00.000Z' },
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

    const { GET } = await import('@/app/api/health/scrapers/universal/route')
    const response = await GET()

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.source_url).toBe('https://univercell.ai/')
    expect(json.fallback_used).toBe(false)
    expect(json.is_primary_source).toBe(true)
  })
})
