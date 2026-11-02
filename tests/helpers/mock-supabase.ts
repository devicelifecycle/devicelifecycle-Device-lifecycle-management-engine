import { vi } from 'vitest'

/**
 * Build a mock Supabase client that satisfies requireAuth's call chain:
 *   auth.getSession() → session
 *   .from(table).select().eq().single()   (users table)
 *   .from(table).select().eq().is().maybeSingle()  (impersonation_log)
 *
 * For test-specific overrides on `.from()`, pass a `fromOverride` callback.
 */
export function createMockSupabaseClient(
  user: { id: string } | null,
  profile: Record<string, unknown> | null,
  fromOverride?: (table: string) => unknown,
) {
  const session = user ? { user, access_token: 'mock-token' } : null

  const defaultChain = () => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = vi.fn(self)
    chain.eq = vi.fn(self)
    chain.neq = vi.fn(self)
    chain.gte = vi.fn(self)
    chain.lte = vi.fn(self)
    chain.gt = vi.fn(self)
    chain.lt = vi.fn(self)
    chain.in = vi.fn(self)
    chain.is = vi.fn(self)
    chain.or = vi.fn(self)
    chain.not = vi.fn(self)
    chain.like = vi.fn(self)
    chain.ilike = vi.fn(self)
    chain.contains = vi.fn(self)
    chain.order = vi.fn(self)
    chain.limit = vi.fn(self)
    chain.range = vi.fn(self)
    chain.filter = vi.fn(self)
    chain.insert = vi.fn(self)
    chain.upsert = vi.fn(self)
    chain.update = vi.fn(self)
    chain.delete = vi.fn(self)
    chain.single = vi.fn().mockResolvedValue({ data: profile, error: null })
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    chain.then = (res: (v: unknown) => void) => res({ data: profile ? [profile] : [], error: null, count: 0 })
    return chain
  }

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (fromOverride) {
        const result = fromOverride(table)
        if (result) return result
      }
      return defaultChain()
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}
