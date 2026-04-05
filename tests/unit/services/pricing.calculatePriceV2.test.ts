// ============================================================================
// PRICING ENGINE — calculatePriceV2 cross-verification
// ============================================================================
// Cross-verifies:
//   1. Trade-in quote is anchored to competitor trade_in_price, not wholesale
//   2. Quote is below the highest competitor (ceiling enforced)
//   3. Quote is at or above the competitive floor (70% of avg — won't lowball)
//   4. Quote = competitor_avg × (1 - margin%) ± $10 (margin formula wins when above floor)
//   5. No-data case returns an explicit error (no silent wholesale fallback)
//   6. Storage normalization: "128 GB" and "128GB" produce same quote
//
// Test device: Apple iPhone 14 128GB (realistic competitor data)

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Supabase mock ────────────────────────────────────────────────────────────
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: mockFrom })),
}))
vi.mock('@/lib/pricing-device-resolution', () => ({
  resolveComparablePricingDeviceId: vi.fn(async (_: unknown, id: string) => id),
}))

// ── Test data ────────────────────────────────────────────────────────────────
const DEVICE_ID = 'd0140000-0000-0000-0000-000000000001'
const FRESH = new Date().toISOString()

function compRow(competitor: string, condition: string, trade_in_price: number) {
  return { competitor_name: competitor, trade_in_price, sell_price: null, condition, storage: '128GB', updated_at: FRESH, scraped_at: FRESH, created_at: FRESH }
}

// Realistic competitor trade-in prices per condition
const COMP: Record<string, ReturnType<typeof compRow>[]> = {
  excellent: [compRow('GoRecell', 'excellent', 265), compRow('Telus', 'excellent', 270), compRow('Bell', 'excellent', 260)],
  good:      [compRow('GoRecell', 'good', 215),      compRow('Telus', 'good', 220),      compRow('Bell', 'good', 210)],
  fair:      [compRow('GoRecell', 'fair', 160),      compRow('Telus', 'fair', 165),      compRow('Bell', 'fair', 155)],
  broken:    [compRow('GoRecell', 'broken', 80),     compRow('Telus', 'broken', 85),     compRow('Bell', 'broken', 75)],
}

const COND_TO_COMP: Record<string, string> = { new: 'excellent', excellent: 'excellent', good: 'good', fair: 'fair', poor: 'broken' }

// Competitor stats per condition
const STATS = {
  excellent: { avg: (265 + 270 + 260) / 3, highest: 270 },
  good:      { avg: (215 + 220 + 210) / 3, highest: 220 },
  fair:      { avg: (160 + 165 + 155) / 3, highest: 165 },
  poor:      { avg: (80 + 85 + 75) / 3,    highest: 85 },
}

// ── Supabase mock builder ─────────────────────────────────────────────────────
function buildMock(deviceCondition: string) {
  const compRows = COMP[COND_TO_COMP[deviceCondition] ?? 'good'] ?? []

  return (table: string) => {
    const base = {
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
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }

    if (table === 'competitor_prices') {
      return {
        ...base,
        then: (resolve: (v: { data: typeof compRows; error: null }) => unknown) =>
          Promise.resolve().then(() => resolve({ data: compRows, error: null })),
      }
    }

    if (table === 'repair_costs') {
      return {
        ...base,
        then: (resolve: (v: { data: []; error: null }) => unknown) =>
          Promise.resolve().then(() => resolve({ data: [], error: null })),
      }
    }

    return {
      ...base,
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve().then(() => resolve({ data: null, error: null })),
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('PricingService.calculatePriceV2 — competitor-anchored quotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // ── Per-condition: formula check (avg × margin, within $10) ──────────────
  const MARGIN = 0.20 // default 20%
  const TOLERANCE = 10

  for (const condition of ['excellent', 'good', 'fair'] as const) {
    it(`${condition}: quote = competitor_avg × (1 - 20%) ± $${TOLERANCE}`, async () => {
      mockFrom.mockImplementation(buildMock(condition))

      const { PricingService } = await import('@/services/pricing.service')
      const result = await PricingService['calculatePriceV2']({ device_id: DEVICE_ID, storage: '128GB', condition })

      expect(result.success).toBe(true)
      expect(result.trade_price).toBeGreaterThan(0)

      const { avg } = STATS[condition]
      const expectedFormula = avg * (1 - MARGIN)
      const diff = Math.abs((result.trade_price ?? 0) - expectedFormula)
      expect(diff).toBeLessThanOrEqual(TOLERANCE)
    })
  }

  // ── Ceiling: never above highest competitor ────────────────────────────────
  for (const condition of ['excellent', 'good', 'fair', 'poor'] as const) {
    it(`${condition}: quote ≤ highest competitor ($${STATS[condition].highest})`, async () => {
      mockFrom.mockImplementation(buildMock(condition))

      const { PricingService } = await import('@/services/pricing.service')
      const result = await PricingService['calculatePriceV2']({ device_id: DEVICE_ID, storage: '128GB', condition })

      expect(result.success).toBe(true)
      expect(result.trade_price ?? 0).toBeLessThanOrEqual(STATS[condition].highest)
    })
  }

  // ── Floor: never absurdly below avg (≥70% of avg) ─────────────────────────
  for (const condition of ['excellent', 'good', 'fair'] as const) {
    it(`${condition}: quote ≥ 70% of competitor avg (competitive floor)`, async () => {
      mockFrom.mockImplementation(buildMock(condition))

      const { PricingService } = await import('@/services/pricing.service')
      const result = await PricingService['calculatePriceV2']({ device_id: DEVICE_ID, storage: '128GB', condition })

      expect(result.success).toBe(true)
      const floor = STATS[condition].avg * 0.70
      expect(result.trade_price ?? 0).toBeGreaterThanOrEqual(floor)
    })
  }

  // ── No-data: must return error, not wholesale-inflated price ───────────────
  it('returns error (not wholesale price) when competitor_prices is empty', async () => {
    const emptyMock = (table: string) => ({
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
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve().then(() => resolve({ data: null, error: null })),
    })
    mockFrom.mockImplementation(emptyMock)

    const { PricingService } = await import('@/services/pricing.service')
    const result = await PricingService['calculatePriceV2']({ device_id: DEVICE_ID, storage: '128GB', condition: 'good' })

    expect(result.success).toBe(false)
    expect(result.trade_price ?? 0).toBe(0)
    expect(result.error).toMatch(/scraper/i)
  })

  // ── Storage normalization ──────────────────────────────────────────────────
  it('"128 GB" and "128GB" produce identical quotes', async () => {
    mockFrom.mockImplementation(buildMock('good'))

    const { PricingService } = await import('@/services/pricing.service')
    const [r1, r2] = await Promise.all([
      PricingService['calculatePriceV2']({ device_id: DEVICE_ID, storage: '128GB',  condition: 'good' }),
      PricingService['calculatePriceV2']({ device_id: DEVICE_ID, storage: '128 GB', condition: 'good' }),
    ])

    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    expect(r1.trade_price).toBe(r2.trade_price)
  })

  // ── Wholesale not used even when market_prices is populated ───────────────
  it('ignores market_prices wholesale when competitor data exists', async () => {
    // market_prices returns a high wholesale value
    const mockWithWholesale = (table: string) => {
      if (table === 'competitor_prices') {
        const rows = COMP['good']
        return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          then: (resolve: (v: { data: typeof rows; error: null }) => unknown) =>
            Promise.resolve().then(() => resolve({ data: rows, error: null })),
        }
      }
      if (table === 'market_prices') {
        return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { wholesale_c_stock: 412 }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { wholesale_c_stock: 412 }, error: null }),
          then: (resolve: (v: { data: null; error: null }) => unknown) =>
            Promise.resolve().then(() => resolve({ data: null, error: null })),
        }
      }
      return {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve: (v: { data: null; error: null }) => unknown) =>
          Promise.resolve().then(() => resolve({ data: null, error: null })),
      }
    }

    mockFrom.mockImplementation(mockWithWholesale)

    const { PricingService } = await import('@/services/pricing.service')
    const result = await PricingService['calculatePriceV2']({ device_id: DEVICE_ID, storage: '128GB', condition: 'good' })

    expect(result.success).toBe(true)
    // Quote must not be anywhere near the wholesale-derived price (~$330)
    // It should be based on competitor avg ($215)
    expect(result.trade_price ?? 0).toBeLessThan(250)
    expect(result.trade_price ?? 0).toBeGreaterThan(130)
  })
})
