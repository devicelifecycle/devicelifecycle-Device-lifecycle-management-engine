// ============================================================================
// SCRAPER UTILITIES
// ============================================================================

export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 3,
  timeoutMs = 15000
): Promise<Response> {
  let lastError: Error | null = null
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        ...options,
        signal: options?.signal ?? controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-CA,en;q=0.9',
          ...options?.headers,
        },
      })

      if (res.ok) {
        clearTimeout(timeout)
        return res
      }

      const shouldRetry = res.status === 408 || res.status === 429 || res.status >= 500
      if (!shouldRetry || i === retries - 1) {
        clearTimeout(timeout)
        return res
      }

      await sleep(1000 * (i + 1) + Math.floor(Math.random() * 300))
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (i < retries - 1) await sleep(1000 * (i + 1) + Math.floor(Math.random() * 300))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null
  const cleaned = text.replace(/[^0-9.]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Extract all price values from an HTML string using common patterns.
 * Returns array of { price, context } for matching logic.
 */
export function extractPricesFromHtml(html: string): Array<{ price: number; context: string }> {
  const results: Array<{ price: number; context: string }> = []
  // Match $XXX, $X,XXX, $XXX.XX patterns with surrounding context
  const regex = /(.{0,80})\$\s*([\d,]+\.?\d*)(.{0,40})/g
  let match
  while ((match = regex.exec(html)) !== null) {
    const price = parsePrice(match[2])
    if (price != null && price >= 5 && price <= 5000) {
      results.push({
        price,
        context: (match[1] + '$' + match[2] + match[3]).trim(),
      })
    }
  }
  return results
}

/**
 * Build a device slug for URL construction
 */
export function buildDeviceSlug(make: string, model: string, storage?: string): string {
  const parts = [make, model]
  if (storage) parts.push(storage)
  return parts
    .join('-')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
}

/**
 * Throttle between requests to avoid rate limiting
 */
export async function throttle(ms = 500): Promise<void> {
  await sleep(ms)
}
