import { describe, it, expect, vi } from 'vitest'
import { executeRetention, PER_CLASS_RUN_CEILING, BATCH_SIZE } from '@/lib/retention-execute'
import { RETENTION_TARGETS } from '@/lib/retention'

type RpcCall = { p_table: string; p_ts_column: string; p_tenant_id: string; p_cutoff: string; p_limit: number }

/**
 * Stand-in for the service-role client. Records every rpc() and every audit
 * insert so the tests can assert on what the executor *would* delete — which
 * is the only thing that matters for a job that removes production rows.
 */
function fakeSupabase(tenants: Array<{ id: string; name: string; settings?: unknown }>, deleteBehaviour?: (c: RpcCall, callIndex: number) => number | Error) {
  const rpcCalls: RpcCall[] = []
  const audits: Record<string, unknown>[] = []
  let perTargetIndex = new Map<string, number>()

  const client = {
    from: (table: string) => {
      if (table === 'tenants') {
        const chain: Record<string, unknown> = {}
        chain.select = () => chain
        chain.order = () => Promise.resolve({ data: tenants, error: null })
        return chain
      }
      if (table === 'retention_runs') {
        return { insert: (row: Record<string, unknown>) => { audits.push(row); return Promise.resolve({ error: null }) } }
      }
      throw new Error(`unexpected table ${table}`)
    },
    rpc: (fn: string, args: RpcCall) => {
      expect(fn).toBe('retention_delete_batch')
      rpcCalls.push(args)
      const key = `${args.p_tenant_id}:${args.p_table}`
      const i = perTargetIndex.get(key) ?? 0
      perTargetIndex.set(key, i + 1)
      const out = deleteBehaviour ? deleteBehaviour(args, i) : 0
      if (out instanceof Error) return Promise.resolve({ data: null, error: { message: out.message } })
      return Promise.resolve({ data: out, error: null })
    },
  }
  return { client: client as unknown as Parameters<typeof executeRetention>[0], rpcCalls, audits }
}

describe('executeRetention — safety', () => {
  it('deletes NOTHING for a tenant with no policy (the default)', async () => {
    const { client, rpcCalls, audits } = fakeSupabase([{ id: 't1', name: 'Unconfigured VAR', settings: {} }])
    const res = await executeRetention(client, 'cron')
    expect(rpcCalls).toHaveLength(0)
    expect(audits).toHaveLength(0)
    expect(res.totalDeleted).toBe(0)
    expect(res.lines).toHaveLength(0)
  })

  it('ignores an out-of-range policy rather than acting on it', async () => {
    // 3 days is below the floor → resolveRetentionPolicy yields null → skipped.
    const { client, rpcCalls } = fakeSupabase([{ id: 't1', name: 'Typo VAR', settings: { retention: { audit_logs: 3 } } }])
    await executeRetention(client, 'cron')
    expect(rpcCalls).toHaveLength(0)
  })

  it('only ever targets allowlisted tables with their verified timestamp column', async () => {
    const settings = { retention: Object.fromEntries(RETENTION_TARGETS.map((t) => [t.key, 365])) }
    const { client, rpcCalls } = fakeSupabase([{ id: 't1', name: 'Full VAR', settings }])
    await executeRetention(client, 'cron')
    const allowed = new Map(RETENTION_TARGETS.map((t) => [t.table as string, t.tsColumn as string]))
    for (const c of rpcCalls) {
      expect(allowed.get(c.p_table)).toBe(c.p_ts_column)
      expect(c.p_tenant_id).toBe('t1')
    }
    expect(rpcCalls).toHaveLength(RETENTION_TARGETS.length)
  })

  it('scopes every delete to one tenant and never crosses tenants', async () => {
    const settings = { retention: { notifications: 90 } }
    const { client, rpcCalls } = fakeSupabase([
      { id: 't1', name: 'A', settings },
      { id: 't2', name: 'B', settings: {} },
    ])
    await executeRetention(client, 'cron')
    expect(rpcCalls.every((c) => c.p_tenant_id === 't1')).toBe(true)
  })
})

describe('executeRetention — batching', () => {
  it('stops as soon as a batch comes back short', async () => {
    const { client, rpcCalls } = fakeSupabase(
      [{ id: 't1', name: 'A', settings: { retention: { notifications: 90 } } }],
      (c, i) => (i === 0 ? c.p_limit : 5), // full batch, then a short one
    )
    const res = await executeRetention(client, 'cron')
    expect(rpcCalls).toHaveLength(2)
    expect(res.totalDeleted).toBe(BATCH_SIZE + 5)
    expect(res.lines[0].capped).toBe(false)
  })

  it('stops at the per-class ceiling and flags the line as capped', async () => {
    const { client, rpcCalls } = fakeSupabase(
      [{ id: 't1', name: 'A', settings: { retention: { notifications: 90 } } }],
      (c) => c.p_limit, // always a full batch — infinite eligible rows
    )
    const res = await executeRetention(client, 'cron')
    expect(res.totalDeleted).toBe(PER_CLASS_RUN_CEILING)
    expect(res.lines[0].capped).toBe(true)
    expect(rpcCalls.length).toBe(PER_CLASS_RUN_CEILING / BATCH_SIZE)
    expect(rpcCalls.every((c) => c.p_limit <= BATCH_SIZE)).toBe(true)
  })
})

describe('executeRetention — auditing', () => {
  it('writes an audit row per class, including a zero-row outcome', async () => {
    const { client, audits } = fakeSupabase([{ id: 't1', name: 'A', settings: { retention: { notifications: 90, audit_logs: 365 } } }])
    await executeRetention(client, 'admin-123')
    expect(audits).toHaveLength(2)
    expect(audits.every((a) => a.rows_deleted === 0 && a.error === null)).toBe(true)
    expect(audits.every((a) => a.triggered_by === 'admin-123')).toBe(true)
    expect(audits.map((a) => a.data_class).sort()).toEqual(['audit_logs', 'notifications'])
  })

  it('records a failure instead of reporting it as zero rows, and keeps going', async () => {
    const { client, audits } = fakeSupabase(
      [{ id: 't1', name: 'A', settings: { retention: { notifications: 90, audit_logs: 365 } } }],
      (c) => (c.p_table === 'notifications' ? new Error('deadlock detected') : 0),
    )
    const res = await executeRetention(client, 'cron')
    const failed = res.lines.find((l) => l.key === 'notifications')
    const ok = res.lines.find((l) => l.key === 'audit_logs')
    expect(failed?.error).toMatch(/deadlock/)
    expect(ok?.error).toBeUndefined()
    expect(audits.find((a) => a.data_class === 'notifications')?.error).toMatch(/deadlock/)
    expect(res.lines).toHaveLength(2) // the failure did not abort the run
  })

  it('cutoff is days before now, and is what gets sent to the RPC', async () => {
    const now = new Date('2026-09-22T12:00:00.000Z')
    const { client, rpcCalls } = fakeSupabase([{ id: 't1', name: 'A', settings: { retention: { notifications: 90 } } }])
    const res = await executeRetention(client, 'cron', now)
    expect(res.lines[0].cutoff).toBe('2026-06-24T12:00:00.000Z')
    expect(rpcCalls[0].p_cutoff).toBe('2026-06-24T12:00:00.000Z')
  })
})
