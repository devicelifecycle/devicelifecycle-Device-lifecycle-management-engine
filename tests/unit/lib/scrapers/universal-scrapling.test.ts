import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __internal, getUniverCellScraperImpl } from '@/lib/scrapers/adapters/universal-scrapling'

describe('universal scrapling adapter', () => {
  const originalImpl = process.env.SCRAPER_UNIVERCELL_IMPL

  beforeEach(() => {
    if (originalImpl === undefined) {
      delete process.env.SCRAPER_UNIVERCELL_IMPL
    } else {
      process.env.SCRAPER_UNIVERCELL_IMPL = originalImpl
    }
    vi.restoreAllMocks()
  })

  it('defaults to ts implementation', () => {
    delete process.env.SCRAPER_UNIVERCELL_IMPL
    expect(getUniverCellScraperImpl()).toBe('ts')
  })

  it('normalizes supported implementation values', () => {
    process.env.SCRAPER_UNIVERCELL_IMPL = 'dual'
    expect(getUniverCellScraperImpl()).toBe('dual')

    process.env.SCRAPER_UNIVERCELL_IMPL = 'SCRAPLING'
    expect(getUniverCellScraperImpl()).toBe('scrapling')
  })

  it('falls back to ts on invalid implementation values', () => {
    process.env.SCRAPER_UNIVERCELL_IMPL = 'unexpected'
    expect(getUniverCellScraperImpl()).toBe('ts')
  })

  it('parses a valid worker response', () => {
    const parsed = __internal.parseWorkerResponse(
      JSON.stringify({
        competitor_name: 'UniverCell',
        prices: [
          {
            competitor_name: 'UniverCell',
            make: 'Apple',
            model: 'iPhone 15 Pro',
            storage: '256GB',
            trade_in_price: 900,
            sell_price: null,
            condition: 'good',
            scraped_at: new Date().toISOString(),
          },
        ],
        success: true,
        duration_ms: 123,
      })
    )

    expect(parsed.success).toBe(true)
    expect(parsed.prices).toHaveLength(1)
  })

  it('parses the last JSON line when the worker emits logs first', () => {
    const parsed = __internal.parseWorkerResponse(
      [
        '[2026-03-25 11:23:54] INFO: Fetched (200) <GET https://univercell.ai/sell/details/mobile>',
        JSON.stringify({
          competitor_name: 'UniverCell',
          prices: [],
          success: false,
          error: 'not implemented',
          duration_ms: 12,
        }),
      ].join('\n')
    )

    expect(parsed.success).toBe(false)
    expect(parsed.error).toBe('not implemented')
  })

  it('rejects malformed worker responses', () => {
    expect(() =>
      __internal.parseWorkerResponse(
        JSON.stringify({
          competitor_name: 'WrongName',
          prices: [],
          success: true,
          duration_ms: 10,
        })
      )
    ).toThrow(/Unexpected worker competitor name/)
  })

  it('sanitizes worker env to avoid passing app secrets', () => {
    process.env.PATH = process.env.PATH || '/usr/bin'
    process.env.UNIVERCELL_ACTION_GET_DEVICE_TYPES = 'abc'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret'

    const env = __internal.getWorkerEnv()

    expect(env.PATH).toBeTruthy()
    expect(env.UNIVERCELL_ACTION_GET_DEVICE_TYPES).toBe('abc')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
  })

  it('compares scraper results and reports mismatches', () => {
    const comparison = __internal.compareScraperResults(
      {
        competitor_name: 'UniverCell',
        success: true,
        duration_ms: 1,
        prices: [
          {
            competitor_name: 'UniverCell',
            make: 'Apple',
            model: 'iPhone 15 Pro',
            storage: '256GB',
            trade_in_price: 500,
            sell_price: null,
            condition: 'good',
            scraped_at: new Date().toISOString(),
          },
        ],
      },
      {
        competitor_name: 'UniverCell',
        success: true,
        duration_ms: 1,
        prices: [
          {
            competitor_name: 'UniverCell',
            make: 'Apple',
            model: 'iPhone 15 Pro',
            storage: '256GB',
            trade_in_price: 510,
            sell_price: null,
            condition: 'good',
            scraped_at: new Date().toISOString(),
          },
          {
            competitor_name: 'UniverCell',
            make: 'Samsung',
            model: 'Galaxy S24 Ultra',
            storage: '256GB',
            trade_in_price: 600,
            sell_price: null,
            condition: 'good',
            scraped_at: new Date().toISOString(),
          },
        ],
      }
    )

    expect(comparison.overlapping_keys).toBe(1)
    expect(comparison.scrapling_only_count).toBe(1)
    expect(comparison.max_trade_in_delta).toBe(10)
    expect(comparison.mismatch_samples).toHaveLength(1)
  })
})
