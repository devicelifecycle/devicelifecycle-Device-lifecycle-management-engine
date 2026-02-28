import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()
const healthCheckMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/services/shippo.service', () => ({
  ShippoService: {
    healthCheck: healthCheckMock,
  },
}))

function makeSupabase({ user, role = 'coe_manager' }: { user: { id: string } | null; role?: string }) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== 'users') throw new Error(`Unexpected table: ${table}`)
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: role ? { role } : null }),
      }
    }),
  }
}

describe('GET /api/shippo/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for unauthenticated requests', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: null }))
    const { GET } = await import('@/app/api/shippo/health/route')

    const response = await GET()
    expect(response.status).toBe(401)
  })

  it('returns 503 when key is configured but invalid/unhealthy', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'u1' } }))
    healthCheckMock.mockResolvedValue({
      keyConfigured: true,
      apiReachable: true,
      keyValid: false,
      message: 'Shippo API key is invalid or unauthorized',
    })

    const { GET } = await import('@/app/api/shippo/health/route')
    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      keyConfigured: true,
      apiReachable: true,
      keyValid: false,
      message: 'Shippo API key is invalid or unauthorized',
    })
  })

  it('returns 200 when Shippo health is good', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ user: { id: 'u1' }, role: 'admin' }))
    healthCheckMock.mockResolvedValue({
      keyConfigured: true,
      apiReachable: true,
      keyValid: true,
      message: 'Shippo connectivity is healthy',
    })

    const { GET } = await import('@/app/api/shippo/health/route')
    const response = await GET()

    expect(response.status).toBe(200)
  })
})
