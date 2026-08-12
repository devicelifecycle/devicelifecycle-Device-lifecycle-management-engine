// ============================================================================
// RATE LIMITER — shared-store (Redis) with in-memory fallback
// ============================================================================
// Fixed-window rate limiter for API endpoints.
//
// Serverless functions on Vercel run as many isolated instances, so a purely
// in-memory counter under-enforces limits (each instance counts on its own).
// When a Vercel KV / Upstash Redis instance is configured (via env vars) the
// limiter uses it as a single shared source of truth across all instances —
// the behaviour you need at scale. When it is NOT configured, or if Redis is
// unreachable, it transparently falls back to the in-memory counter, so the
// app behaves exactly as before and a Redis outage can never brick requests.
//
// To enable the shared store, set either pair of env vars (Vercel KV or Upstash):
//   KV_REST_API_URL / KV_REST_API_TOKEN
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes (in-memory fallback only)
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
 * In-memory fixed-window check. Synchronous; per-instance only.
 * Retained as the fallback path and for callers that don't need the shared store.
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

// ── Shared store (Redis over REST) ──────────────────────────────────────────

interface RedisRestConfig {
  url: string
  token: string
}

/** Read Vercel KV or Upstash REST credentials from env, if present. */
export function getRedisRestConfig(): RedisRestConfig | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/+$/, ''), token }
}

/**
 * Atomic fixed-window counter in Redis via the Upstash/Vercel-KV REST pipeline:
 *   INCR key                 -> current count in this window
 *   PEXPIRE key windowMs NX  -> start the window only on the first hit
 *   PTTL key                 -> ms remaining, for an accurate resetAt
 * Returns null on any missing config / network / shape error so the caller
 * falls back to the in-memory counter (fail-safe, never fail-closed).
 */
async function redisFixedWindow(
  cfg: RedisRestConfig,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult | null> {
  const windowMs = config.windowSeconds * 1000
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['PEXPIRE', key, String(windowMs), 'NX'],
        ['PTTL', key],
      ]),
      cache: 'no-store',
    })
    if (!res.ok) return null

    const data = (await res.json()) as Array<{ result?: unknown; error?: string }>
    if (!Array.isArray(data) || data.length < 3) return null

    const count = Number(data[0]?.result)
    if (!Number.isFinite(count) || count < 1) return null

    let ttl = Number(data[2]?.result)
    // No expiry set (edge case / NX unsupported) — set it and use the full window.
    if (!Number.isFinite(ttl) || ttl < 0) {
      void fetch(`${cfg.url}/pexpire/${encodeURIComponent(key)}/${windowMs}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}` },
        cache: 'no-store',
      }).catch(() => {})
      ttl = windowMs
    }

    const resetAt = Date.now() + ttl
    if (count > config.limit) return { allowed: false, remaining: 0, resetAt }
    return { allowed: true, remaining: Math.max(0, config.limit - count), resetAt }
  } catch {
    return null
  }
}

/**
 * Rate-limit check backed by the shared Redis store when configured, otherwise
 * the in-memory counter. Prefer this in request handlers — it is correct across
 * many serverless instances. Falls back to in-memory on any Redis error, so it
 * is always at least as available as the previous in-memory-only limiter.
 */
export async function checkRateLimitAsync(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedisRestConfig()
  if (redis) {
    const viaRedis = await redisFixedWindow(redis, key, config)
    if (viaRedis) return viaRedis
  }
  return checkRateLimit(key, config)
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
  /** Public, unauthenticated endpoints (device value lookup, etc.): 20 requests per minute per IP */
  public: { limit: 20, windowSeconds: 60 } as RateLimitConfig,
}
