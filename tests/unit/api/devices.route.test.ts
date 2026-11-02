import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDevicesMock = vi.fn()

vi.mock('@/services/device.service', () => ({
  DeviceService: {
    getDevices: getDevicesMock,
  },
}))

const createMockSupabase = (user: { id: string } | null, profile: { role?: string } | null) => {
  const session = user ? { user, access_token: 'mock-token' } : null
  const chain: Record<string, unknown> = {}
  const self = () => chain
  for (const m of ['select', 'eq', 'is', 'neq', 'order', 'limit']) chain[m] = vi.fn(self)
  chain.single = vi.fn().mockResolvedValue({ data: profile })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null })
  return {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session } }) },
    from: vi.fn().mockReturnValue(chain),
  }
}

const createServerSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

describe('GET /api/devices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDevicesMock.mockResolvedValue({
      data: [{ id: 'dev-1', make: 'Apple', model: 'iPhone 15' }],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    })
  })

  it('returns 401 when not authenticated', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase(null, null))

    const { GET } = await import('@/app/api/devices/route')
    const res = await GET(new NextRequest('http://localhost/api/devices'))

    expect(res.status).toBe(401)
    expect(getDevicesMock).not.toHaveBeenCalled()
  })

  it('returns devices for internal user', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase({ id: 'u1' }, { role: 'admin' }))

    const { GET } = await import('@/app/api/devices/route')
    const res = await GET(new NextRequest('http://localhost/api/devices'))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toBeDefined()
    expect(json.data.length).toBe(1)
    expect(getDevicesMock).toHaveBeenCalled()
  })
})
