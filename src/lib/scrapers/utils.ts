// ============================================================================
// SCRAPER UTILITIES
// ============================================================================

export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 3
): Promise<Response> {
  let lastError: Error | null = null
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TradePriceBot/1.0)',
          'Accept': 'text/html,application/json',
          ...options?.headers,
        },
      })
      return res
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (i < retries - 1) await sleep(1000 * (i + 1))
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
  return Number.isFinite(n) ? n : null
}
