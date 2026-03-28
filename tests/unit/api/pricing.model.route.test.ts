import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMockSupabase = (user: { id: string } | null, profile: { role?: string } | null) => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { base_price: 500, wholesale_c_stock: 450 } }),
  }),
})

const createServerSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

describe('GET /api/pricing/model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase(null, null))

    const { GET } = await import('@/app/api/pricing/model/route')
    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('returns list of models when authenticated', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase({ id: 'u1' }, { role: 'admin' }))

    const { GET } = await import('@/app/api/pricing/model/route')
    const res = await GET()

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.models)).toBe(true)
    expect(json.models.length).toBeGreaterThan(0)
    const ids = json.models.map((m: { id: string }) => m.id)
    expect(ids).toContain('simple_margin')
    expect(ids).toContain('competitor_beat')
    expect(ids).toContain('data_driven')
  })
})

describe('POST /api/pricing/model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calculates price with simple_margin model', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase({ id: 'u1' }, { role: 'admin' }))

    const { POST } = await import('@/app/api/pricing/model/route')
    const res = await POST(new NextRequest('http://localhost/api/pricing/model', {
      method: 'POST',
      body: JSON.stringify({
        model_id: 'simple_margin',
        device_id: 'd0010000-0000-0000-0000-000000000001',
        storage: '128GB',
        condition: 'good',
        base_price: 500,
        purpose: 'buy',
        quantity: 1,
      }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.final_price).toBeGreaterThan(0)
    expect(json.breakdown?.base_price).toBe(500)
  })

  it('returns 400 for unknown model_id', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase({ id: 'u1' }, { role: 'admin' }))

    const { POST } = await import('@/app/api/pricing/model/route')
    const res = await POST(new NextRequest('http://localhost/api/pricing/model', {
      method: 'POST',
      body: JSON.stringify({
        model_id: 'unknown_model',
        device_id: 'd0010000-0000-0000-0000-000000000001',
        storage: '128GB',
        condition: 'good',
      }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Unknown model')
  })
})
