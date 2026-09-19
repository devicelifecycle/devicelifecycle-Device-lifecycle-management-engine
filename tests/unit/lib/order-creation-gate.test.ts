import { describe, it, expect, vi } from 'vitest'
import { monthStartUtc, orderCreationGate } from '@/lib/order-creation-gate'

// Minimal PostgREST-builder stand-in: every chained call returns the same
// object; awaiting it yields the configured result.
function fakeSupabase(opts: { settings?: unknown; settingsError?: unknown; count?: number }) {
  const settingsResult = { data: opts.settingsError ? null : { settings: opts.settings ?? {} }, error: opts.settingsError ?? null }
  const countResult = { count: opts.count ?? 0, error: null }
  let table = ''
  const chain: Record<string, unknown> = {}
  const self = () => chain
  for (const m of ['select', 'eq', 'gte', 'maybeSingle']) chain[m] = vi.fn(self)
  chain.then = (res: (v: unknown) => void) => res(table === 'tenants' ? settingsResult : countResult)
  return { from: vi.fn((t: string) => { table = t; return chain }) } as unknown as Parameters<typeof orderCreationGate>[0]
}

describe('monthStartUtc', () => {
  it('is the first instant of the month in UTC', () => {
    expect(monthStartUtc(new Date('2026-09-19T23:59:59.000Z'))).toBe('2026-09-01T00:00:00.000Z')
    expect(monthStartUtc(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('orderCreationGate', () => {
  it('is a no-op with no tenant in scope', async () => {
    expect(await orderCreationGate(fakeSupabase({}), null, 'trade_in')).toBeNull()
  })

  it('passes an unconfigured tenant (defaults: modules on, unlimited)', async () => {
    expect(await orderCreationGate(fakeSupabase({ settings: {} }), 't1', 'cpo')).toBeNull()
  })

  it('blocks when the module is switched off', async () => {
    const res = await orderCreationGate(fakeSupabase({ settings: { features: { trade_in: false } } }), 't1', 'trade_in')
    expect(res?.status).toBe(403)
    expect((await res!.json()).error).toMatch(/Trade-In is not enabled/)
  })

  it('blocks at the monthly transaction cap and passes below it', async () => {
    const capped = await orderCreationGate(fakeSupabase({ settings: { license: { transactionsPerMonth: 5 } }, count: 5 }), 't1', 'trade_in')
    expect(capped?.status).toBe(403)
    const ok = await orderCreationGate(fakeSupabase({ settings: { license: { transactionsPerMonth: 5 } }, count: 4 }), 't1', 'trade_in')
    expect(ok).toBeNull()
  })

  it('fails CLOSED when the settings lookup errors', async () => {
    const res = await orderCreationGate(fakeSupabase({ settingsError: new Error('boom') }), 't1', 'trade_in')
    expect(res?.status).toBe(503)
  })
})
