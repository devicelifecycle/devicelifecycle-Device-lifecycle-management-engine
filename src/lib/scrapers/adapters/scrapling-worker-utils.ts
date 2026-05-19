import type { ScrapedPrice, ScraperResult } from '../types'

/**
 * Call the Scrapling HTTP API service when SCRAPLING_API_URL is set.
 * Returns null when the env var is absent OR on network error so callers
 * can transparently fall back to local subprocess.
 *
 * Used by every *-scrapling.ts adapter so Vercel crons can reach the
 * Railway-hosted Python service instead of trying to spawn a local process.
 */
export async function callScraplingApiOrNull(
  provider: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  competitorName: string,
  startTime: number,
): Promise<ScraperResult | null> {
  const apiUrl = (process.env.SCRAPLING_API_URL ?? '').replace(/\/+$/, '')
  if (!apiUrl) return null

  const apiKey = process.env.SCRAPLING_API_KEY ?? ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs + 5_000) // +5s grace

  try {
    const res = await fetch(`${apiUrl}/scrape/${provider}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        competitor_name: competitorName,
        prices: [],
        success: false,
        error: `Scrapling API HTTP ${res.status}: ${body.slice(0, 200)}`,
        duration_ms: Date.now() - startTime,
      }
    }

    const data = await res.json() as Record<string, unknown>
    const prices = Array.isArray(data.prices)
      ? (data.prices as ScrapedPrice[])
      : []

    return {
      competitor_name: competitorName,
      prices,
      success: Boolean(data.success),
      error: typeof data.error === 'string' && data.error ? data.error : undefined,
      duration_ms: typeof data.duration_ms === 'number' ? data.duration_ms : Date.now() - startTime,
    }
  } catch (e) {
    clearTimeout(timer)
    const isAbort = (e as { name?: string }).name === 'AbortError'
    if (isAbort) {
      return {
        competitor_name: competitorName,
        prices: [],
        success: false,
        error: `Scrapling API timed out after ${timeoutMs}ms`,
        duration_ms: Date.now() - startTime,
      }
    }
    // Network error (service down, DNS failure) — fall back to subprocess
    console.warn(`[ScraplingApi] ${provider}: network error, falling back to subprocess: ${(e as Error).message}`)
    return null
  }
}

export function redactWorkerLogs(raw: string): string {
  if (!raw) return ''

  return raw
    .replace(/(authorization['"]?\s*[:=]\s*['"]?)(bearer\s+)?[a-z0-9._~+/-]+/gi, '$1[REDACTED]')
    .replace(/(cookie['"]?\s*[:=]\s*['"]?)[^'"\n]+/gi, '$1[REDACTED]')
    .replace(/(set-cookie['"]?\s*[:=]\s*['"]?)[^'"\n]+/gi, '$1[REDACTED]')
    .replace(/(x-api-key['"]?\s*[:=]\s*['"]?)[^'"\n]+/gi, '$1[REDACTED]')
    .replace(/(access[_-]?token['"]?\s*[:=]\s*['"]?)[^'"\n]+/gi, '$1[REDACTED]')
    .replace(/(refresh[_-]?token['"]?\s*[:=]\s*['"]?)[^'"\n]+/gi, '$1[REDACTED]')
    .replace(/\b(supabase_service_role_key|service_role_key)\b[^ \n]*/gi, '[REDACTED_KEY]')
    .trim()
}
