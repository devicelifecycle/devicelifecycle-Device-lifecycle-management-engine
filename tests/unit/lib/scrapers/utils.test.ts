import { describe, expect, it, vi } from 'vitest'
import { parsePrice, fetchWithRetry } from '@/lib/scrapers/utils'

describe('scraper utils', () => {
  describe('parsePrice', () => {
    it('parses $500.00', () => {
      expect(parsePrice('$500.00')).toBe(500)
    })
    it('parses $1,234.56', () => {
      expect(parsePrice('$1,234.56')).toBe(1234.56)
    })
    it('parses 350 (no dollar sign)', () => {
      expect(parsePrice('350')).toBe(350)
    })
    it('returns null for invalid input', () => {
      expect(parsePrice('abc')).toBe(null)
      expect(parsePrice('')).toBe(null)
    })
  })

  describe('fetchWithRetry', () => {
    it('returns response on success', async () => {
      const mockRes = { ok: true, text: () => Promise.resolve('ok') }
      const fetchMock = vi.fn().mockResolvedValue(mockRes)
      vi.stubGlobal('fetch', fetchMock)

      const res = await fetchWithRetry('https://example.com', { method: 'GET' })
      expect(res).toBe(mockRes)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      vi.unstubAllGlobals()
    })
  })
})
