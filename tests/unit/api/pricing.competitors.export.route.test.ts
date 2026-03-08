import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getCompetitorPricesMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()

vi.mock('@/services/pricing.service', () => ({
  PricingService: {
    getCompetitorPrices: getCompetitorPricesMock,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('jspdf', () => ({
  jsPDF: class {
    setFontSize = vi.fn()
    text = vi.fn()
    output = vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]).buffer)
  },
}))

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}))

const createMockSupabase = (user: { id: string } | null, profile: { role?: string } | null) => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user } }),
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: profile }),
  }),
})

describe('GET /api/pricing/competitors/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCompetitorPricesMock.mockResolvedValue([
      {
        id: 'cp-1',
        device_id: 'd-1',
        storage: '128GB',
        condition: 'good',
        competitor_name: 'Bell',
        trade_in_price: 325,
        sell_price: 499,
        source: 'scraped',
        updated_at: '2026-03-06T00:00:00.000Z',
        device: { make: 'Apple', model: 'iPhone 15' },
      },
    ])
  })

  it('returns 401 for unauthenticated user', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase(null, null))

    const { GET } = await import('@/app/api/pricing/competitors/export/route')
    const response = await GET(new NextRequest('http://localhost/api/pricing/competitors/export?format=excel'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns Excel export with expected content type', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase({ id: 'u1' }, { role: 'admin' }))

    const { GET } = await import('@/app/api/pricing/competitors/export/route')
    const response = await GET(new NextRequest('http://localhost/api/pricing/competitors/export?format=excel&condition=good'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/vnd.ms-excel')
    expect(response.headers.get('Content-Disposition')).toContain('competitor-prices-')

    const text = await response.text()
    expect(text).toContain('Competitor Price Tracking')
    expect(text).toContain('iPhone 15')
    expect(text).toContain('Bell')
    expect(getCompetitorPricesMock).toHaveBeenCalledWith(undefined, 'good')
  })

  it('returns PDF export when format=pdf', async () => {
    createServerSupabaseClientMock.mockReturnValue(createMockSupabase({ id: 'u1' }, { role: 'admin' }))

    const { GET } = await import('@/app/api/pricing/competitors/export/route')
    const response = await GET(new NextRequest('http://localhost/api/pricing/competitors/export?format=pdf'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/pdf')
    expect(response.headers.get('Content-Disposition')).toContain('.pdf')

    const arrayBuffer = await response.arrayBuffer()
    expect(arrayBuffer.byteLength).toBeGreaterThan(0)
  })
})
