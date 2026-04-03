import { describe, expect, it, vi } from 'vitest'

import { resolveComparablePricingDeviceId } from '@/lib/pricing-device-resolution'

function createQuery(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: result, error: null }),
    then: (onfulfilled: (value: { data: unknown; error: null }) => unknown, onrejected?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: result, error: null }).then(onfulfilled, onrejected),
  }
}

describe('resolveComparablePricingDeviceId', () => {
  it('prefers the sibling device id with real pricing evidence', async () => {
    const deviceQuery = createQuery({
      id: 'empty-device',
      make: 'Apple',
      model: 'iPhone 15 Pro',
      category: 'phone',
    })
    const siblingQuery = createQuery([
      { id: 'empty-device' },
      { id: 'priced-device' },
    ])
    const competitorQuery = createQuery([
      { device_id: 'priced-device' },
      { device_id: 'priced-device' },
      { device_id: 'priced-device' },
    ])
    const marketQuery = createQuery([{ device_id: 'priced-device' }])
    const baselineQuery = createQuery([{ device_id: 'priced-device' }])
    const pricingQuery = createQuery([{ device_id: 'priced-device' }])

    const supabase = {
      from: vi.fn((table: string) => {
        const callIndex = supabase.from.mock.calls.length
        if (table === 'device_catalog' && callIndex === 1) return deviceQuery
        if (table === 'device_catalog') return siblingQuery
        if (table === 'competitor_prices') return competitorQuery
        if (table === 'market_prices') return marketQuery
        if (table === 'trained_pricing_baselines') return baselineQuery
        if (table === 'pricing_tables') return pricingQuery
        throw new Error(`Unexpected table ${table}`)
      }),
    }

    const resolved = await resolveComparablePricingDeviceId(supabase as never, 'empty-device')

    expect(resolved).toBe('priced-device')
  })

  it('keeps the original device id when no sibling has pricing evidence', async () => {
    const deviceQuery = createQuery({
      id: 'original-device',
      make: 'Apple',
      model: 'iPhone 14',
      category: 'phone',
    })
    const siblingQuery = createQuery([
      { id: 'original-device' },
      { id: 'duplicate-device' },
    ])
    const emptyQuery = createQuery([])

    const supabase = {
      from: vi.fn((table: string) => {
        const callIndex = supabase.from.mock.calls.length
        if (table === 'device_catalog' && callIndex === 1) return deviceQuery
        if (table === 'device_catalog') return siblingQuery
        if (table === 'competitor_prices') return emptyQuery
        if (table === 'market_prices') return emptyQuery
        if (table === 'trained_pricing_baselines') return emptyQuery
        if (table === 'pricing_tables') return emptyQuery
        throw new Error(`Unexpected table ${table}`)
      }),
    }

    const resolved = await resolveComparablePricingDeviceId(supabase as never, 'original-device')

    expect(resolved).toBe('original-device')
  })
})
