import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkCompetitorPriceStalenessMock = vi.fn()

vi.mock('@/services/pricing-health.service', () => ({
  PricingHealthService: {
    checkCompetitorPriceStaleness: checkCompetitorPriceStalenessMock,
  },
}))

describe('GET /api/cron/pricing-staleness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ;(process.env as Record<string, string | undefined>).CRON_SECRET = ' secret123 \n'
    ;(process.env as Record<string, string | undefined>).PRICING_STALENESS_MONITOR_ENABLED = 'true'

    checkCompetitorPriceStalenessMock.mockResolvedValue({
      threshold_days: 7,
      checked_groups: 120,
      stale_groups: 8,
      max_age_days: 14,
      stale_examples: [],
      notifications_sent: 2,
      notifications_skipped: 0,
    })
  })

  it('returns 401 when auth header is invalid', async () => {
    const { GET } = await import('@/app/api/cron/pricing-staleness/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/pricing-staleness', {
      headers: { authorization: 'Bearer wrong' },
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns staleness summary when authorized', async () => {
    const { GET } = await import('@/app/api/cron/pricing-staleness/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/pricing-staleness', {
      headers: { authorization: 'Bearer secret123' },
    }))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.stale_groups).toBe(8)
    expect(json.notifications_sent).toBe(2)
    expect(checkCompetitorPriceStalenessMock).toHaveBeenCalledTimes(1)
  })

  it('skips when monitor is disabled', async () => {
    ;(process.env as Record<string, string | undefined>).PRICING_STALENESS_MONITOR_ENABLED = ' false \n'

    const { GET } = await import('@/app/api/cron/pricing-staleness/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/pricing-staleness', {
      headers: { authorization: 'Bearer secret123' },
    }))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.skipped).toBe(true)
    expect(checkCompetitorPriceStalenessMock).not.toHaveBeenCalled()
  })

  it('accepts an auth secret with trailing whitespace in env', async () => {
    const { GET } = await import('@/app/api/cron/pricing-staleness/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/pricing-staleness', {
      headers: { authorization: 'Bearer secret123' },
    }))

    expect(response.status).toBe(200)
    expect(checkCompetitorPriceStalenessMock).toHaveBeenCalledTimes(1)
  })
})
