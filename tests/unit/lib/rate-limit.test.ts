import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkRateLimit, checkRateLimitAsync, getRedisRestConfig } from '@/lib/rate-limit'

const KEY_ENVS = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']

describe('rate-limit — in-memory fallback', () => {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    // Ensure no Redis config so the async path falls back to in-memory.
    for (const k of KEY_ENVS) { saved[k] = process.env[k]; delete process.env[k] }
  })
  afterEach(() => {
    for (const k of KEY_ENVS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
    vi.restoreAllMocks()
  })

  it('getRedisRestConfig returns null when no env is set', () => {
    expect(getRedisRestConfig()).toBeNull()
  })

  it('allows up to the limit, then blocks', () => {
    const key = `test-${Math.random()}`
    const cfg = { limit: 3, windowSeconds: 60 }
    expect(checkRateLimit(key, cfg).allowed).toBe(true)  // 1
    expect(checkRateLimit(key, cfg).allowed).toBe(true)  // 2
    expect(checkRateLimit(key, cfg).allowed).toBe(true)  // 3
    const blocked = checkRateLimit(key, cfg)             // 4
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('checkRateLimitAsync matches the in-memory limiter when Redis is not configured', async () => {
    const cfg = { limit: 2, windowSeconds: 60 }
    const key = `async-${Math.random()}`
    expect((await checkRateLimitAsync(key, cfg)).allowed).toBe(true)  // 1
    expect((await checkRateLimitAsync(key, cfg)).allowed).toBe(true)  // 2
    expect((await checkRateLimitAsync(key, cfg)).allowed).toBe(false) // 3 -> blocked
  })

  it('reports decreasing remaining count', () => {
    const key = `rem-${Math.random()}`
    const cfg = { limit: 5, windowSeconds: 60 }
    expect(checkRateLimit(key, cfg).remaining).toBe(4)
    expect(checkRateLimit(key, cfg).remaining).toBe(3)
  })
})

describe('rate-limit — Redis path falls back safely on error', () => {
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    for (const k of KEY_ENVS) saved[k] = process.env[k]
    process.env.KV_REST_API_URL = 'https://example-kv.invalid'
    process.env.KV_REST_API_TOKEN = 'test-token'
  })
  afterEach(() => {
    for (const k of KEY_ENVS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] }
    vi.restoreAllMocks()
  })

  it('getRedisRestConfig reads KV env and strips trailing slashes', () => {
    process.env.KV_REST_API_URL = 'https://example-kv.invalid/'
    const cfg = getRedisRestConfig()
    expect(cfg).not.toBeNull()
    expect(cfg?.url).toBe('https://example-kv.invalid')
  })

  it('falls back to in-memory (allowed) when the Redis fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const res = await checkRateLimitAsync(`redis-fail-${Math.random()}`, { limit: 3, windowSeconds: 60 })
    // On Redis error we must never fail closed — the in-memory fallback allows the first hit.
    expect(res.allowed).toBe(true)
  })

  it('uses the Redis count when the pipeline responds', async () => {
    // Simulate INCR=1, PEXPIRE=1, PTTL=60000 -> allowed, remaining = limit-1
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ result: 1 }, { result: 1 }, { result: 60000 }],
    }))
    const res = await checkRateLimitAsync(`redis-ok-${Math.random()}`, { limit: 10, windowSeconds: 60 })
    expect(res.allowed).toBe(true)
    expect(res.remaining).toBe(9)
  })

  it('blocks via Redis when the count exceeds the limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ result: 11 }, { result: 0 }, { result: 30000 }],
    }))
    const res = await checkRateLimitAsync(`redis-block-${Math.random()}`, { limit: 10, windowSeconds: 60 })
    expect(res.allowed).toBe(false)
    expect(res.remaining).toBe(0)
  })
})
