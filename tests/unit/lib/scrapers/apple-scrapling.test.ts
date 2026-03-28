import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __internal, getAppleScraperImpl } from '@/lib/scrapers/adapters/apple-scrapling'

describe('apple scrapling adapter', () => {
  const originalImpl = process.env.SCRAPER_APPLE_IMPL

  beforeEach(() => {
    if (originalImpl === undefined) delete process.env.SCRAPER_APPLE_IMPL
    else process.env.SCRAPER_APPLE_IMPL = originalImpl
    vi.restoreAllMocks()
  })

  it('defaults to ts implementation', () => {
    delete process.env.SCRAPER_APPLE_IMPL
    expect(getAppleScraperImpl()).toBe('ts')
  })

  it('normalizes supported implementation values', () => {
    process.env.SCRAPER_APPLE_IMPL = 'dual'
    expect(getAppleScraperImpl()).toBe('dual')
    process.env.SCRAPER_APPLE_IMPL = 'SCRAPLING'
    expect(getAppleScraperImpl()).toBe('scrapling')
  })

  it('parses valid worker response after logs', () => {
    const parsed = __internal.parseWorkerResponse([
      '[info] log line',
      JSON.stringify({
        competitor_name: 'Apple Trade-In',
        prices: [],
        success: true,
        duration_ms: 10,
      }),
    ].join('\n'))
    expect(parsed.success).toBe(true)
  })

  it('sanitizes worker env', () => {
    process.env.PATH = process.env.PATH || '/usr/bin'
    process.env.APPLE_TRADE_IN_URL = 'https://example.com'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret'
    const env = __internal.getWorkerEnv()
    expect(env.PATH).toBeTruthy()
    expect(env.APPLE_TRADE_IN_URL).toBe('https://example.com')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
  })

  it('compares scraper results', () => {
    const comparison = __internal.compareScraperResults(
      {
        competitor_name: 'Apple Trade-In',
        success: true,
        duration_ms: 1,
        prices: [{
          competitor_name: 'Apple Trade-In',
          make: 'Apple',
          model: 'iPhone 15 Pro',
          storage: '128GB',
          trade_in_price: 400,
          sell_price: null,
          condition: 'good',
          scraped_at: new Date().toISOString(),
        }],
      },
      {
        competitor_name: 'Apple Trade-In',
        success: true,
        duration_ms: 1,
        prices: [{
          competitor_name: 'Apple Trade-In',
          make: 'Apple',
          model: 'iPhone 15 Pro',
          storage: '128GB',
          trade_in_price: 405,
          sell_price: null,
          condition: 'good',
          scraped_at: new Date().toISOString(),
        }],
      }
    )
    expect(comparison.overlapping_keys).toBe(1)
    expect(comparison.max_trade_in_delta).toBe(5)
  })
})
