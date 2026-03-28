import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __internal, getGoRecellScraperImpl } from '@/lib/scrapers/adapters/gorecell-scrapling'

describe('gorecell scrapling adapter', () => {
  const originalImpl = process.env.SCRAPER_GORECELL_IMPL

  beforeEach(() => {
    if (originalImpl === undefined) delete process.env.SCRAPER_GORECELL_IMPL
    else process.env.SCRAPER_GORECELL_IMPL = originalImpl
    vi.restoreAllMocks()
  })

  it('defaults to ts implementation', () => {
    delete process.env.SCRAPER_GORECELL_IMPL
    expect(getGoRecellScraperImpl()).toBe('ts')
  })

  it('normalizes supported implementation values', () => {
    process.env.SCRAPER_GORECELL_IMPL = 'dual'
    expect(getGoRecellScraperImpl()).toBe('dual')
    process.env.SCRAPER_GORECELL_IMPL = 'SCRAPLING'
    expect(getGoRecellScraperImpl()).toBe('scrapling')
  })

  it('parses valid worker response after logs', () => {
    const parsed = __internal.parseWorkerResponse([
      '[info] log line',
      JSON.stringify({
        competitor_name: 'GoRecell',
        prices: [],
        success: true,
        duration_ms: 10,
      }),
    ].join('\n'))
    expect(parsed.success).toBe(true)
  })

  it('sanitizes worker env', () => {
    process.env.PATH = process.env.PATH || '/usr/bin'
    process.env.GORECELL_STORE_API = 'https://example.com'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret'
    const env = __internal.getWorkerEnv()
    expect(env.PATH).toBeTruthy()
    expect(env.GORECELL_STORE_API).toBe('https://example.com')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
  })

  it('compares scraper results', () => {
    const comparison = __internal.compareScraperResults(
      {
        competitor_name: 'GoRecell',
        success: true,
        duration_ms: 1,
        prices: [{
          competitor_name: 'GoRecell',
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
        competitor_name: 'GoRecell',
        success: true,
        duration_ms: 1,
        prices: [{
          competitor_name: 'GoRecell',
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
