import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calculateAdaptivePriceMock = vi.fn()

vi.mock('@/services/pricing.service', () => ({
  PricingService: {
    calculateAdaptivePrice: calculateAdaptivePriceMock,
  },
}))

const createServiceRoleClientMock = vi.fn(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
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
    calculateAdaptivePriceMock.mockResolvedValue({
      success: true,
      trade_price: 350,
      cpo_price: 450,
      confidence: 0.9,
      competitors: [],
      channel_decision: {
        recommended_channel: 'marketplace',
        margin_percent: 0,
        margin_tier: 'green',
        reasoning: 'Adaptive pricing',
        value_add_viable: false,
      },
      risk_mode: 'retail',
      price_date: new Date().toISOString(),
      valid_for_hours: 24,
      breakdown: {
        anchor_price: 400,
        condition_adjustment: 0,
        deductions: 0,
        breakage_deduction: 0,
        margin_applied: 0,
        final_trade_price: 350,
        final_cpo_price: 450,
      },
    })
  })

  it('returns 401 when not authenticated', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase(null, null))

    const { POST } = await import('@/app/api/pricing/calculate/route')
    const res = await POST(new NextRequest('http://localhost/api/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify({
        version: 'v2',
        device_id: 'd0010000-0000-0000-0000-000000000001',
        storage: '128GB',
        condition: 'good',
      }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(res.status).toBe(401)
    expect(calculateAdaptivePriceMock).not.toHaveBeenCalled()
  })

  it('blocks customer role from direct pricing access', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase({ id: 'u1' }, { role: 'customer' }))

    const { POST } = await import('@/app/api/pricing/calculate/route')
    const res = await POST(new NextRequest('http://localhost/api/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify({
        version: 'v2',
        device_id: 'd0010000-0000-0000-0000-000000000001',
        storage: '128GB',
        condition: 'good',
      }),
      headers: { 'Content-Type': 'application/json' },
    }))

    const json = await res.json()
    expect(res.status).toBe(403)
    expect(json.error).toBe('Forbidden')
    expect(calculateAdaptivePriceMock).not.toHaveBeenCalled()
    expect(createServiceRoleClientMock).not.toHaveBeenCalled()
  })

  it('calls PricingService.calculateAdaptivePrice for v2 and returns result', async () => {
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
    expect(calculateAdaptivePriceMock).toHaveBeenCalledTimes(1)
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
    expect(calculateAdaptivePriceMock).not.toHaveBeenCalled()
  })
})
