// ============================================================================
// IN-MEMORY RATE LIMITER
// ============================================================================
// Simple sliding window rate limiter for API endpoints.
// For production at scale, replace with Redis-based (e.g., @vercel/kv).

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  store.forEach((entry, key) => {
    if (now > entry.resetAt) store.delete(key)
  })
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number
  /** Window duration in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Check if a request is within rate limits.
 * @param key - Unique identifier (e.g., IP + endpoint)
 * @param config - Rate limit configuration
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 })
    return { allowed: true, remaining: config.limit - 1, resetAt: now + config.windowSeconds * 1000 }
  }

  entry.count++
  if (entry.count > config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt }
}

/**
 * Get client IP from request headers, Vercel-safe.
 *
 * On Vercel: `x-real-ip` is injected by the edge network and cannot be spoofed
 * from outside. We prefer it over `x-forwarded-for`, whose leftmost entry can be
 * forged by the client before hitting the edge (classic rate-limit bypass).
 *
 * If `x-real-ip` is absent (local dev, non-Vercel), we take the LAST entry of
 * `x-forwarded-for` — the one appended by the nearest trusted proxy — rather than
 * the first (client-controlled) entry.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
    'unknown'
  )
}

// Preset configs
export const RATE_LIMITS = {
  /** Auth endpoints: 10 requests per 15 minutes */
  auth: { limit: 10, windowSeconds: 900 } as RateLimitConfig,
  /** API endpoints: 100 requests per minute */
  api: { limit: 100, windowSeconds: 60 } as RateLimitConfig,
  /** Strict: 5 requests per 15 minutes (forgot password, etc.) */
  strict: { limit: 5, windowSeconds: 900 } as RateLimitConfig,
}
