import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calculatePriceV2Mock = vi.fn()
const getPricingSettingsMock = vi.fn()

vi.mock('@/services/pricing.service', () => ({
  PricingService: {
    calculatePriceV2: calculatePriceV2Mock,
    getPricingSettings: getPricingSettingsMock,
  },
}))

const createMockSupabase = (user: { id: string } | null, profile: { role?: string } | null) => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: profile }),
  }),
})

const createServerSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

describe('POST /api/pricing/calculate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPricingSettingsMock.mockResolvedValue({ prefer_data_driven: false })
    calculatePriceV2Mock.mockResolvedValue({
      success: true,
      trade_price: 350,
      cpo_price: 450,
      confidence: 0.9,
    })
  })

  it('returns 401 when not authenticated', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase(null, null))

    const { POST } = await import('@/app/api/pricing/calculate/route')
    const res = await POST(new NextRequest('http://localhost/api/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify({ version: 'v2', device_id: 'dev-1', storage: '128GB', condition: 'good' }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(res.status).toBe(401)
    expect(calculatePriceV2Mock).not.toHaveBeenCalled()
  })

  it('returns 403 for customer role', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase({ id: 'u1' }, { role: 'customer' }))

    const { POST } = await import('@/app/api/pricing/calculate/route')
    const res = await POST(new NextRequest('http://localhost/api/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify({ version: 'v2', device_id: 'dev-1', storage: '128GB', condition: 'good' }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(res.status).toBe(403)
  })

  it('calls PricingService.calculatePriceV2 for v2 and returns result', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase({ id: 'u1' }, { role: 'admin' }))

    const { POST } = await import('@/app/api/pricing/calculate/route')
    const res = await POST(new NextRequest('http://localhost/api/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify({
        version: 'v2',
        device_id: 'd0010000-0000-0000-0000-000000000001',
        storage: '128GB',
        carrier: 'Unlocked',
        condition: 'good',
        quantity: 2,
      }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.trade_price).toBe(350)
    expect(calculatePriceV2Mock).toHaveBeenCalledTimes(1)
  })

  it('returns 400 for invalid v2 payload', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase({ id: 'u1' }, { role: 'admin' }))

    const { POST } = await import('@/app/api/pricing/calculate/route')
    const res = await POST(new NextRequest('http://localhost/api/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify({ version: 'v2', device_id: 'invalid', storage: '128GB', condition: 'good' }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(res.status).toBe(400)
    expect(calculatePriceV2Mock).not.toHaveBeenCalled()
  })
})
