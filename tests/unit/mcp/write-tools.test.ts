import { describe, it, expect, vi, beforeEach } from 'vitest'
import { memoryDb } from '../../helpers/memory-db'

const createOrder = vi.fn()
const transition = vi.fn()
const manage = vi.fn()
const actedAs: string[] = []
vi.mock('@/app/api/orders/route', () => ({ POST: (...a: unknown[]) => createOrder(...a) }))
vi.mock('@/app/api/orders/[id]/transition/route', () => ({ POST: (...a: unknown[]) => transition(...a) }))
vi.mock('@/app/api/customers/[id]/manage/route', () => ({ POST: (...a: unknown[]) => manage(...a) }))
vi.mock('@/lib/supabase/impersonation-session', () => ({ userAccessToken: async () => 'user-token' }))
vi.mock('@/lib/supabase/acting-user', () => ({
  runAsUser: async (u: { userId: string }, fn: () => Promise<unknown>) => { actedAs.push(u.userId); return fn() },
}))
vi.mock('@/services/pricing.service', () => ({
  PricingService: { calculateAdaptivePrice: vi.fn().mockResolvedValue({ success: true, trade_price: 200 }) },
}))

import { handleMessage } from '@/lib/mcp/handler'

const T = 'tenant-1'
const C1 = '11111111-1111-4111-8111-111111111111'   // rep's customer
const C2 = '22222222-2222-4222-8222-222222222222'   // someone else's
const DEV = '33333333-3333-4333-8333-333333333333'
const O1 = '44444444-4444-4444-8444-444444444444'
let db: ReturnType<typeof memoryDb>
const rep = { id: 'rep-1', role: 'var_sales_rep', region: 'Ontario', clientName: 'Claude' }

function ctx(user: object | undefined = rep) {
  return { key: { keyId: 'oauth:f', tenantId: T, scopes: ['read', 'write'] }, tenantId: T, supabase: db, user } as never
}
const deps = () => ({ meter: vi.fn().mockResolvedValue(null), log: vi.fn() })
async function call(name: string, args: object, c = ctx()) {
  const r = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, c, deps()) as { result: { isError?: boolean; structuredContent?: Record<string, unknown>; content: { text: string }[] } }
  return r.result
}
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  vi.clearAllMocks(); actedAs.length = 0
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-secret'
  db = memoryDb({
    customers: [
      { id: C1, tenant_id: T, company_name: 'QA VAR Test Co', region: 'Ontario', assigned_rep_id: 'rep-1' },
      { id: C2, tenant_id: T, company_name: 'Other Co', region: 'Ontario', assigned_rep_id: 'rep-2' },
    ],
    orders: [{ id: O1, tenant_id: T, order_number: 'PO-9', type: 'trade_in', status: 'draft', customer_id: C1, total_amount: 0 }],
    device_catalog: [{ id: DEV, make: 'Apple', model: 'iPhone 13', is_active: true }],
    users: [{ id: 'rep-2', role: 'var_sales_rep', tenant_id: T, is_active: true, full_name: 'Rep Two' }],
    mcp_confirmations: [],
  }, { mcp_confirmations: 'token_hash' })
  createOrder.mockResolvedValue(ok({ id: 'new-order', order_number: 'PO-10', status: 'draft' }, 201))
  transition.mockResolvedValue(ok({ id: O1, status: 'submitted' }))
  manage.mockResolvedValue(ok({ ok: true }))
})

describe('MCP write tools: preview → confirm, through the real route handlers', () => {
  it('preview never acts; confirm acts once, as the signed-in user; replay returns the first result', async () => {
    const args = { customer_id: C1, items: [{ device_id: DEV, quantity: 2, condition: 'good', storage: '128GB' }] }
    const p = await call('create_trade_in_order', args)
    expect(p.structuredContent).toMatchObject({ status: 'preview', customer: 'QA VAR Test Co', estimated_total: '360–440 CAD' })
    expect(createOrder).not.toHaveBeenCalled()
    const token = p.structuredContent!.confirm_token as string

    const done = await call('create_trade_in_order', { ...args, confirm_token: token })
    expect(done.structuredContent).toMatchObject({ status: 'done', order_number: 'PO-10' })
    expect(createOrder).toHaveBeenCalledTimes(1)
    expect(actedAs).toEqual(['rep-1'])
    const body = JSON.parse(await (createOrder.mock.calls[0][0] as Request).text())
    expect(body).toEqual({ customer_id: C1, type: 'trade_in', items: args.items })

    const replay = await call('create_trade_in_order', { ...args, confirm_token: token })
    expect(replay.structuredContent).toMatchObject({ status: 'done', order_number: 'PO-10' })
    expect(createOrder).toHaveBeenCalledTimes(1)
  })

  it('a confirm_token for different arguments is refused', async () => {
    const p = await call('submit_order', { order: 'PO-9' })
    const r = await call('submit_order', { order: 'PO-9', note: 'sneaky', confirm_token: p.structuredContent!.confirm_token as string })
    expect(r.content[0].text).toMatch(/confirm_invalid/)
    expect(transition).not.toHaveBeenCalled()
  })

  it("another rep's customer / order is invisible (not_found), never previewed or acted on", async () => {
    expect((await call('create_trade_in_order', { customer_id: C2, items: [{ device_id: DEV, quantity: 1 }] })).content[0].text).toMatch(/not_found/)
    db.tables.orders[0].customer_id = C2
    expect((await call('submit_order', { order: 'PO-9' })).content[0].text).toMatch(/not_found/)
    expect(createOrder).not.toHaveBeenCalled(); expect(transition).not.toHaveBeenCalled()
  })

  it('state machine is checked in the preview (draft cannot be accepted)', async () => {
    const r = await call('accept_quote', { order: 'PO-9' })
    expect(r.content[0].text).toMatch(/not_allowed/)
  })

  it('submit passes the order id and an "via assistant" note to the transition route', async () => {
    const p = await call('submit_order', { order: 'PO-9', note: 'Customer emailed' })
    await call('submit_order', { order: 'PO-9', note: 'Customer emailed', confirm_token: p.structuredContent!.confirm_token as string })
    const [req, routeCtx] = transition.mock.calls[0] as [Request, { params: Promise<{ id: string }> }]
    expect(await routeCtx.params).toEqual({ id: O1 })
    expect(JSON.parse(await req.text())).toEqual({ to_status: 'submitted', notes: 'Customer emailed — Via Claude (AI assistant)' })
  })

  it("the route's refusal reaches the assistant as a tool error (rules stay the app's)", async () => {
    transition.mockResolvedValueOnce(ok({ error: 'VAR staff can only submit or cancel an order' }, 403))
    const p = await call('cancel_order', { order: 'PO-9' })
    const r = await call('cancel_order', { order: 'PO-9', confirm_token: p.structuredContent!.confirm_token as string })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/VAR staff can only submit/)
    expect(r.content[0].text).toMatch(/not_allowed/)
  })

  it('assign_customer_rep only accepts an active sales rep of the same organization', async () => {
    const bad = await call('assign_customer_rep', { customer_id: C1, rep_id: '55555555-5555-4555-8555-555555555555' })
    expect(bad.content[0].text).toMatch(/not_found/)
    const notARep = await call('assign_customer_rep', { customer_id: C1, rep_id: C2 }) // a customer id, not a rep
    expect(notARep.content[0].text).toMatch(/not_found/)
    expect(manage).not.toHaveBeenCalled()
  })
})
