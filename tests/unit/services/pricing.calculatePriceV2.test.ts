import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockPricingModelGet = vi.fn()
const mockModelCalculate = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock('@/lib/pricing-device-resolution', () => ({
  resolveComparablePricingDeviceId: vi.fn(async (_: unknown, id: string) => id),
}))

vi.mock('@/models/pricing', () => ({
  PricingModelRegistry: {
    get: mockPricingModelGet,
  },
}))

const DEVICE_ID = 'd0140000-0000-0000-0000-000000000001'
const FRESH = new Date().toISOString()

function compRow(competitor: string, condition: string, trade_in_price: number) {
  return {
    competitor_name: competitor,
    trade_in_price,
    sell_price: null,
    condition,
    storage: '128GB',
    updated_at: FRESH,
    scraped_at: FRESH,
    created_at: FRESH,
    retrieved_at: FRESH,
  }
}

const GOOD_ROWS = [
  compRow('GoRecell', 'good', 152),
  compRow('Telus', 'good', 80),
  compRow('Bell', 'good', 70),
  compRow('Apple Trade-In', 'good', 260),
  compRow('UniverCell', 'good', 245),
]

const FAIR_ROWS = [
  compRow('GoRecell', 'fair', 113),
  compRow('Telus', 'fair', 60),
  compRow('Bell', 'fair', 50),
  compRow('Apple Trade-In', 'fair', 175),
]

const BROKEN_ROWS = [
  compRow('GoRecell', 'broken', 40),
  compRow('Telus', 'broken', 20),
  compRow('Bell', 'broken', 10),
  compRow('UniverCell', 'broken', 95),
]

const REFERENCE_ONLY_ROWS = [
  compRow('Apple Trade-In', 'good', 240),
  compRow('UniverCell', 'good', 230),
]

function buildQuery(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
      Promise.resolve().then(() => resolve({ data, error: null })),
  }
}

function buildMock(rows: ReturnType<typeof compRow>[], options?: { preferDataDriven?: boolean }) {
  return (table: string) => {
    if (table === 'competitor_prices') {
      return buildQuery(rows)
    }
    if (table === 'repair_costs') {
      return buildQuery([])
    }
    if (table === 'pricing_settings') {
      return buildQuery(
        options?.preferDataDriven
          ? [{ setting_key: 'prefer_data_driven', setting_value: 'true' }]
          : []
      )
    }
    return buildQuery(null)
  }
}

describe('PricingService trade-in pricing policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockPricingModelGet.mockReturnValue(null)
    mockModelCalculate.mockReset()
  })

  it('uses the Bell/Telus midpoint blended with GoRecell and ignores Apple/UniverCell', async () => {
    mockFrom.mockImplementation(buildMock(GOOD_ROWS))

    const { PricingService } = await import('@/services/pricing.service')
    const result = await PricingService.calculatePriceV2({
      device_id: DEVICE_ID,
      storage: '128GB',
      condition: 'good',
    })

    expect(result.success).toBe(true)
    expect(result.trade_price).toBe(113.5)
    expect(result.competitors.map((entry) => entry.name).sort()).toEqual(['Bell', 'GoRecell', 'Telus'])
    expect(result.channel_decision.reasoning).toContain('Bell/Telus avg')
  })

  it('uses the selected condition when blending fair-condition prices', async () => {
    mockFrom.mockImplementation(buildMock(FAIR_ROWS))

    const { PricingService } = await import('@/services/pricing.service')
    const result = await PricingService.calculatePriceV2({
      device_id: DEVICE_ID,
      storage: '128GB',
      condition: 'fair',
    })

    expect(result.success).toBe(true)
    expect(result.trade_price).toBe(84)
  })

  it('uses approved broken-condition sources directly instead of the old 50% good fallback', async () => {
    mockFrom.mockImplementation(buildMock(BROKEN_ROWS))

    const { PricingService } = await import('@/services/pricing.service')
    const result = await PricingService.calculatePriceV2({
      device_id: DEVICE_ID,
      storage: '128GB',
      condition: 'poor',
    })

    expect(result.success).toBe(true)
    expect(result.trade_price).toBe(27.5)
  })

  it('returns no-data when only Apple or UniverCell reference rows exist', async () => {
    mockFrom.mockImplementation(buildMock(REFERENCE_ONLY_ROWS))

    const { PricingService } = await import('@/services/pricing.service')
    const result = await PricingService.calculatePriceV2({
      device_id: DEVICE_ID,
      storage: '128GB',
      condition: 'good',
    })

    expect(result.success).toBe(false)
    expect(result.trade_price).toBe(0)
    expect(result.error).toMatch(/competitor trade-in data/i)
  })

  it('normalizes storage input without changing the Bell/Telus + GoRecell result', async () => {
    mockFrom.mockImplementation(buildMock(GOOD_ROWS))

    const { PricingService } = await import('@/services/pricing.service')
    const [compact, spaced] = await Promise.all([
      PricingService.calculatePriceV2({ device_id: DEVICE_ID, storage: '128GB', condition: 'good' }),
      PricingService.calculatePriceV2({ device_id: DEVICE_ID, storage: '128 GB', condition: 'good' }),
    ])

    expect(compact.success).toBe(true)
    expect(spaced.success).toBe(true)
    expect(compact.trade_price).toBe(113.5)
    expect(compact.trade_price).toBe(spaced.trade_price)
  })

  it('calculateTradeInFromCompetitors returns the same policy reference price', async () => {
    mockFrom.mockImplementation(buildMock(GOOD_ROWS))

    const { PricingService } = await import('@/services/pricing.service')
    const result = await PricingService.calculateTradeInFromCompetitors({
      device_id: DEVICE_ID,
      storage: '128GB',
      condition: 'good',
    })

    expect(result.success).toBe(true)
    expect(result.trade_price).toBe(113.5)
    expect(result.competitor_count).toBe(3)
    expect(result.prices.map((entry) => entry.name).sort()).toEqual(['Bell', 'GoRecell', 'Telus'])
  })

  it('keeps the Bell/Telus + GoRecell formula authoritative even when data-driven pricing is enabled', async () => {
    mockFrom.mockImplementation(buildMock(GOOD_ROWS, { preferDataDriven: true }))
    mockPricingModelGet.mockReturnValue({
      calculate: mockModelCalculate,
    })
    mockModelCalculate.mockResolvedValue({
      success: true,
      final_price: 999,
      trade_price: 999,
      cpo_price: 1200,
      confidence: 0.95,
      breakdown: {},
    })

    const { PricingService } = await import('@/services/pricing.service')
    const result = await PricingService.calculateAdaptivePrice({
      device_id: DEVICE_ID,
      storage: '128GB',
      condition: 'good',
    })

    expect(result.success).toBe(true)
    expect(result.trade_price).toBe(113.5)
    expect(mockModelCalculate).not.toHaveBeenCalled()
  })
})
