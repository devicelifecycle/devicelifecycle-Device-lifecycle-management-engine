import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __internal, getTelusScraperImpl } from '@/lib/scrapers/adapters/telus-scrapling'

describe('telus scrapling adapter', () => {
  const originalImpl = process.env.SCRAPER_TELUS_IMPL

  beforeEach(() => {
    if (originalImpl === undefined) delete process.env.SCRAPER_TELUS_IMPL
    else process.env.SCRAPER_TELUS_IMPL = originalImpl
    vi.restoreAllMocks()
  })

  it('defaults to ts implementation', () => {
    delete process.env.SCRAPER_TELUS_IMPL
    expect(getTelusScraperImpl()).toBe('ts')
  })

  it('normalizes supported implementation values', () => {
    process.env.SCRAPER_TELUS_IMPL = 'dual'
    expect(getTelusScraperImpl()).toBe('dual')
    process.env.SCRAPER_TELUS_IMPL = 'SCRAPLING'
    expect(getTelusScraperImpl()).toBe('scrapling')
  })

  it('parses valid worker response after logs', () => {
    const parsed = __internal.parseWorkerResponse([
      '[info] log line',
      JSON.stringify({
        competitor_name: 'Telus',
        prices: [],
        success: true,
        duration_ms: 10,
      }),
    ].join('\n'))
    expect(parsed.success).toBe(true)
  })

  it('sanitizes worker env', () => {
    process.env.PATH = process.env.PATH || '/usr/bin'
    process.env.TELUS_DEVICES_API_URL = 'https://example.com'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret'
    const env = __internal.getWorkerEnv()
    expect(env.PATH).toBeTruthy()
    expect(env.TELUS_DEVICES_API_URL).toBe('https://example.com')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
  })

  it('compares scraper results', () => {
    const comparison = __internal.compareScraperResults(
      {
        competitor_name: 'Telus',
        success: true,
        duration_ms: 1,
        prices: [{
          competitor_name: 'Telus',
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
        competitor_name: 'Telus',
        success: true,
        duration_ms: 1,
        prices: [{
          competitor_name: 'Telus',
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
