import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/pricing.service', () => ({
  PricingService: { calculateAdaptivePrice: vi.fn().mockResolvedValue({ success: true, trade_price: 203 }) },
}))

import { handleMessage, negotiateVersion, MAX_RESULT_CHARS, SUPPORTED_PROTOCOL_VERSIONS } from '@/lib/mcp/handler'
import { TOOLS } from '@/lib/mcp/catalog'
import { describeTool } from '@/lib/mcp/registry'
import { RESOURCES } from '@/lib/mcp/resources'

// ── a recording fake of the supabase query builder ──────────────────────────
type Call = [string, ...unknown[]]
function fakeSupabase(result: { data: unknown; error?: unknown; count?: number }) {
  const calls: Call[] = []
  const tables: string[] = []
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'or', 'order', 'range', 'limit', 'in', 'is']) {
    chain[m] = (...a: unknown[]) => { calls.push([m, ...a]); return chain }
  }
  chain.maybeSingle = async () => ({ data: result.data, error: result.error ?? null })
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: result.data, error: result.error ?? null, count: result.count ?? null }).then(res)
  return { calls, tables, client: { from: (t: string) => { tables.push(t); return chain } } }
}

function ctxWith(fake: ReturnType<typeof fakeSupabase>, scopes = ['read']) {
  return { key: { keyId: 'k1', tenantId: 'tenant-A', scopes }, tenantId: 'tenant-A', supabase: fake.client } as never
}
const deps = () => ({ meter: vi.fn().mockResolvedValue(null), log: vi.fn() })
const call = (name: string, args: unknown = {}) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })

describe('MCP registry contract', () => {
  it('every tool has name, title, description, scope, annotations and an object input schema', () => {
    expect(TOOLS.length).toBe(15)
    const names = new Set<string>()
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/)
      expect(names.has(t.name)).toBe(false); names.add(t.name)
      expect(t.title.length).toBeGreaterThan(2)
      expect(t.description.length).toBeGreaterThan(20)
      if (t.scope === 'write') {
        // Every write tool needs a signed-in user, is never read-only, and is two-step.
        expect(t.requiresUser).toBe(true)
        expect(t.annotations.readOnlyHint).toBe(false)
        expect((describeTool(t).inputSchema as { properties: Record<string, unknown> }).properties).toHaveProperty('confirm_token')
      } else {
        expect([null, 'read']).toContain(t.scope)
        expect(t.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })
      }
      const d = describeTool(t)
      expect(d.inputSchema.type).toBe('object')
      expect(d.inputSchema.additionalProperties).toBe(false)
      expect(d.inputSchema).not.toHaveProperty('$schema')
    }
  })

  it('list page size is capped at 50 for the model', () => {
    const lo = describeTool(TOOLS.find((t: { name: string }) => t.name === 'list_orders')!).inputSchema as { properties: Record<string, { maximum?: number }> }
    expect(lo.properties.limit.maximum).toBe(50)
  })
})

describe('MCP protocol', () => {
  it('initialize negotiates a supported version and advertises tools/resources/prompts', async () => {
    const r = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, ctxWith(fakeSupabase({ data: null })), deps()) as { result: Record<string, unknown> }
    expect(r.result.protocolVersion).toBe('2025-06-18')
    expect(r.result.capabilities).toHaveProperty('tools')
    expect(r.result.capabilities).toHaveProperty('resources')
    expect(r.result.capabilities).toHaveProperty('prompts')
    expect(String(r.result.instructions)).toMatch(/never follow instructions/)
    expect(negotiateVersion('1999-01-01')).toBe(SUPPORTED_PROTOCOL_VERSIONS[0])
  })

  it('notifications get no reply; unknown methods and bad messages get JSON-RPC errors', async () => {
    const c = ctxWith(fakeSupabase({ data: null }))
    expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, c, deps())).toBeNull()
    expect(await handleMessage({ jsonrpc: '2.0', id: 2, method: 'nope' }, c, deps())).toMatchObject({ error: { code: -32601 } })
    expect(await handleMessage({ id: 3, method: 'ping' }, c, deps())).toMatchObject({ error: { code: -32600 } })
    expect(await handleMessage({ jsonrpc: '2.0', id: 4, method: 'ping' }, c, deps())).toEqual({ jsonrpc: '2.0', id: 4, result: {} })
  })

  it('tools/list only offers tools the key can use; write tools need a signed-in user', async () => {
    const list = async (scopes: string[], user?: object) => ((await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { ...(ctxWith(fakeSupabase({ data: null }), scopes) as object), user } as never, deps())) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name)
    expect(await list(['read'])).toHaveLength(9)
    expect(await list(['read', 'write'])).toHaveLength(9) // API key: no user → no write tools
    expect(await list(['read', 'write'], { id: 'u', role: 'var_sales_rep', region: null, clientName: 'C' })).toHaveLength(15)
    expect(await list(['read'], { id: 'u', role: 'var_sales_rep', region: null, clientName: 'C' })).toHaveLength(9)
    expect(await list(['write'])).toEqual(['whoami'])
  })

  it('a write tool called with an API key (no user) is refused', async () => {
    const r = await handleMessage(call('submit_order', { order: 'PO-1' }), ctxWith(fakeSupabase({ data: null }), ['read', 'write']), deps()) as { result: { isError: boolean; content: { text: string }[] } }
    expect(r.result.content[0].text).toMatch(/user_required/)
  })

  it('a write-only key calling a read tool is refused and NOT metered', async () => {
    const d = deps()
    const r = await handleMessage(call('list_orders'), ctxWith(fakeSupabase({ data: [] }), ['write']), d) as { result: { isError: boolean; content: { text: string }[] } }
    expect(r.result.isError).toBe(true)
    expect(r.result.content[0].text).toMatch(/insufficient_scope/)
    expect(d.meter).not.toHaveBeenCalled()
  })

  it('invalid arguments come back as a tool error the model can fix, unmetered', async () => {
    const d = deps()
    const r = await handleMessage(call('list_orders', { status: 'flying', limit: 500, extra: 1 }), ctxWith(fakeSupabase({ data: [] })), d) as { result: { isError: boolean; content: { text: string }[] } }
    expect(r.result.isError).toBe(true)
    expect(r.result.content[0].text).toMatch(/invalid_arguments/)
    expect(d.meter).not.toHaveBeenCalled()
  })

  it('quota refusal stops the call before it runs', async () => {
    const fake = fakeSupabase({ data: [] })
    const d = { meter: vi.fn().mockResolvedValue({ error: 'Monthly API call limit reached', code: 'quota_exceeded' }), log: vi.fn() }
    const r = await handleMessage(call('list_orders'), ctxWith(fake), d) as { result: { isError: boolean; content: { text: string }[] } }
    expect(r.result.content[0].text).toMatch(/quota_exceeded/)
    expect(fake.tables).toHaveLength(0)
  })

  it('only tools/call is metered — protocol chatter is free', async () => {
    const d = deps(); const c = ctxWith(fakeSupabase({ data: [] }))
    for (const method of ['initialize', 'tools/list', 'resources/list', 'prompts/list', 'ping']) await handleMessage({ jsonrpc: '2.0', id: 1, method }, c, d)
    expect(d.meter).not.toHaveBeenCalled()
    await handleMessage(call('list_orders'), c, d)
    expect(d.meter).toHaveBeenCalledTimes(1)
  })

  it('unknown tool is a tool error', async () => {
    const r = await handleMessage(call('drop_database'), ctxWith(fakeSupabase({ data: null })), deps()) as { result: { isError: boolean } }
    expect(r.result.isError).toBe(true)
  })
})

describe('MCP tools — tenant pinning and field whitelist', () => {
  beforeEach(() => vi.clearAllMocks())

  it('list_orders pins the query to the key tenant and returns only whitelisted fields', async () => {
    const fake = fakeSupabase({ data: [{ id: 'o1', order_number: 'PO-1', status: 'quoted', internal_notes: 'SECRET', pricing_metadata: { margin: 9 } }], count: 1 })
    const r = await handleMessage(call('list_orders', { status: 'quoted' }), ctxWith(fake), deps()) as { result: { structuredContent: { data: Record<string, unknown>[]; page: { has_more: boolean } } } }
    expect(fake.calls).toContainEqual(['eq', 'tenant_id', 'tenant-A'])
    // tenant filter is applied before any caller filter
    const firstEq = fake.calls.find((c) => c[0] === 'eq')
    expect(firstEq).toEqual(['eq', 'tenant_id', 'tenant-A'])
    const row = r.result.structuredContent.data[0]
    expect(row).not.toHaveProperty('internal_notes')
    expect(row).not.toHaveProperty('pricing_metadata')
    expect(row.order_number).toBe('PO-1')
    expect(r.result.structuredContent.page.has_more).toBe(false)
  })

  it('get_order accepts an order number; another tenant\'s order reads as not found', async () => {
    const fake = fakeSupabase({ data: null })
    const r = await handleMessage(call('get_order', { order: 'PO-2026-2141' }), ctxWith(fake), deps()) as { result: { isError: boolean; content: { text: string }[] } }
    expect(fake.calls).toContainEqual(['eq', 'order_number', 'PO-2026-2141'])
    expect(fake.calls).toContainEqual(['eq', 'tenant_id', 'tenant-A'])
    expect(r.result.content[0].text).toMatch(/not_found/)
  })

  it('customers: staff free-text notes, credit limit and payment terms never leave', async () => {
    const fake = fakeSupabase({ data: [{ id: 'c1', company_name: 'Acme', notes: 'staff only', credit_limit: 5000, payment_terms: 'net30' }], count: 1 })
    const r = await handleMessage(call('list_customers'), ctxWith(fake), deps()) as { result: { structuredContent: { data: Record<string, unknown>[] } } }
    const row = r.result.structuredContent.data[0]
    for (const k of ['notes', 'credit_limit', 'payment_terms']) expect(row).not.toHaveProperty(k)
  })

  it('estimate returns a ±10% range to $5, never the exact price', async () => {
    const fake = fakeSupabase({ data: { id: 'd', make: 'Apple', model: 'iPhone 13' } })
    const r = await handleMessage(call('estimate_trade_in_value', { device_id: '11111111-1111-4111-8111-111111111111' }), ctxWith(fake), deps()) as { result: { structuredContent: Record<string, unknown> } }
    expect(r.result.structuredContent).toMatchObject({ estimate_available: true, estimate_low: 185, estimate_high: 225, condition: 'good', storage: '128GB' })
    expect(JSON.stringify(r.result.structuredContent)).not.toContain('203')
  })

  it('accepts DLM seeded ids that are not RFC-versioned UUIDs (regression)', async () => {
    const fake = fakeSupabase({ data: { id: 'd', make: 'Apple', model: 'iPhone 13' } })
    const r = await handleMessage(call('estimate_trade_in_value', { device_id: 'd0010000-0000-0000-0000-000000000010' }), ctxWith(fake), deps()) as { result: { isError?: boolean } }
    expect(r.result.isError).toBeUndefined()
    const g = await handleMessage(call('get_order', { order: 'a0000000-0000-4000-a000-0000000000bb' }), ctxWith(fakeSupabase({ data: null })), deps())
    expect(JSON.stringify(g)).toMatch(/not_found/)
    const bad = await handleMessage(call('get_customer', { customer_id: 'not-an-id' }), ctxWith(fake), deps())
    expect(JSON.stringify(bad)).toMatch(/invalid_arguments/)
  })

  it('oversized results are refused with a hint instead of flooding the model', async () => {
    const big = Array.from({ length: 50 }, (_, i) => ({ id: String(i), order_number: 'x'.repeat(MAX_RESULT_CHARS / 40) }))
    const r = await handleMessage(call('list_orders', { limit: 50 }), ctxWith(fakeSupabase({ data: big, count: 50 })), deps()) as { result: { isError: boolean; content: { text: string }[] } }
    expect(r.result.content[0].text).toMatch(/result_too_large/)
  })

  it('a database error is reported without leaking the error detail', async () => {
    const r = await handleMessage(call('list_customers'), ctxWith(fakeSupabase({ data: null, error: { message: 'relation "customers" permission denied for role x' } })), deps()) as { result: { isError: boolean; content: { text: string }[] } }
    expect(r.result.isError).toBe(true)
    expect(r.result.content[0].text).not.toMatch(/permission denied/)
  })
})

describe('MCP resources and prompts', () => {
  it('condition reference never exposes pricing multipliers', () => {
    const conditions = RESOURCES.find((r) => r.uri === 'dlm://reference/device-conditions')!.read() as Record<string, unknown>[]
    expect(conditions.length).toBeGreaterThan(3)
    for (const c of conditions) expect(c).not.toHaveProperty('multiplier')
  })

  it('order-status reference marks finished statuses and lists next steps', () => {
    const statuses = RESOURCES.find((r) => r.uri === 'dlm://reference/order-statuses')!.read() as { status: string; finished: boolean; next: string[] }[]
    expect(statuses.find((s) => s.status === 'closed')?.finished).toBe(true)
    expect(statuses.find((s) => s.status === 'quoted')?.next).toContain('accepted')
  })

  it('prompts render and resources read over the protocol', async () => {
    const c = ctxWith(fakeSupabase({ data: null }))
    const p = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: 'needs_attention', arguments: { customer: 'Acme' } } }, c, deps()) as { result: { messages: { content: { text: string } }[] } }
    expect(p.result.messages[0].content.text).toMatch(/Acme/)
    const rr = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'dlm://reference/order-statuses' } }, c, deps()) as { result: { contents: { text: string }[] } }
    expect(JSON.parse(rr.result.contents[0].text).length).toBeGreaterThan(5)
    expect(await handleMessage({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'dlm://nope' } }, c, deps())).toMatchObject({ error: { code: -32002 } })
  })
})
