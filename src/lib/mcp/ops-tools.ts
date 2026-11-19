// ============================================================================
// MCP OPERATIONS TOOLS — Phase 3 (Byte-Back admin / COE, signed in)
// ============================================================================
// The processing queue across every VAR, and quote release. Offered only to
// Byte-Back operators (platformOnly) — a VAR user never sees these tools and
// gets "unknown tool" if they try one. Reads cross tenants with the service
// role (operators already see every VAR order in the app); the one write,
// release_quote, runs the app's own transition route as the operator, so the
// "only admin / COE manager / sales may quote" rule and the state machine are
// the app's.

import { z } from 'zod/v4'
import { asRow, asRows } from '@/lib/public-api'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import { POST as transitionRoute } from '@/app/api/orders/[id]/transition/route'
import { defineTool, READ_ONLY, WRITE, ToolError, type McpContext, type McpTool } from './registry'
import { ID_PATTERN, TERMINAL_STATUSES } from './tools'
import { twoStep, asUser, internal } from './write-tools'

export const STAGES = {
  awaiting_quote: { statuses: ['submitted'], label: 'Submitted — waiting for Byte-Back to release a quote' },
  awaiting_customer: { statuses: ['quoted'], label: 'Quoted — waiting for the customer to accept' },
  awaiting_shipment: { statuses: ['accepted'], label: 'Accepted — waiting for the devices to ship' },
  at_coe: { statuses: ['shipped_to_coe', 'received', 'in_triage'], label: 'In transit to / at the COE' },
  awaiting_payment: { statuses: ['qc_complete', 'payment_processing'], label: 'QC done — waiting for payout' },
} as const
type Stage = keyof typeof STAGES | 'sla_breached'
const STAGE_KEYS: [Stage, ...Stage[]] = ['awaiting_quote', 'awaiting_customer', 'awaiting_shipment', 'at_coe', 'awaiting_payment', 'sla_breached']

const ORDER_SELECT = 'id, order_number, type, status, created_at, updated_at, quoted_amount, total_amount, is_sla_breached, tenant:tenants(name), customer:customers(company_name)'
const label = (s: unknown) => ORDER_STATUS_CONFIG[s as keyof typeof ORDER_STATUS_CONFIG]?.label ?? String(s)
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

function stageQuery(ctx: McpContext, stage: Stage, cols: string, opts?: { count: 'exact'; head?: boolean }) {
  let q = ctx.supabase.from('orders').select(cols, opts)
  if (stage === 'sla_breached') {
    q = q.eq('is_sla_breached', true).not('status', 'in', `(${[...TERMINAL_STATUSES].join(',')})`)
  } else {
    q = q.in('status', [...STAGES[stage].statuses])
  }
  return q
}

const opsQueue = defineTool({
  name: 'ops_queue',
  title: 'Operations queue (all resellers)',
  description: 'Byte-Back operations: how many orders wait at each processing stage across every reseller, plus the oldest orders in one stage (default awaiting_quote). Stages: awaiting_quote, awaiting_customer, awaiting_shipment, at_coe, awaiting_payment, sla_breached.',
  scope: 'read',
  requiresUser: true,
  platformOnly: true,
  input: z.object({
    stage: z.enum(STAGE_KEYS).default('awaiting_quote'),
    limit: z.number().int().min(1).max(50).default(20),
  }).strict(),
  annotations: READ_ONLY,
  async run(ctx, a) {
    const counts: Record<string, number> = {}
    await Promise.all(STAGE_KEYS.map(async (s) => {
      const { count, error } = await stageQuery(ctx, s, 'id', { count: 'exact', head: true })
      if (error) throw new ToolError('internal', 'Could not load the queue.')
      counts[s] = count ?? 0
    }))
    const { data, error } = await stageQuery(ctx, a.stage, ORDER_SELECT).order('created_at', { ascending: true }).limit(a.limit)
    if (error) throw new ToolError('internal', 'Could not load the queue.')
    const now = Date.now()
    return {
      counts,
      stage: a.stage,
      stage_label: a.stage === 'sla_breached' ? 'Open orders past their SLA' : STAGES[a.stage].label,
      oldest_first: asRows(data).map((o) => ({
        order_number: o.order_number, type: o.type, status: label(o.status),
        reseller: one(o.tenant as { name?: string } | null)?.name ?? null,
        customer: one(o.customer as { company_name?: string } | null)?.company_name ?? null,
        amount: o.quoted_amount ?? o.total_amount ?? null,
        age_days: Math.floor((now - Date.parse(o.created_at as string)) / 86_400_000),
        sla_breached: !!o.is_sla_breached,
      })),
      currency: 'CAD',
    }
  },
})

async function findAnyOrder(ctx: McpContext, ref: string) {
  const isId = ID_PATTERN.test(ref.trim())
  const { data } = await ctx.supabase.from('orders')
    .select('id, order_number, type, status, quoted_amount, total_amount, total_quantity, tenant:tenants(name), customer:customers(company_name)')
    .eq(isId ? 'id' : 'order_number', ref.trim()).maybeSingle()
  const row = asRow(data)
  if (!row) throw new ToolError('not_found', `No order "${ref}".`)
  return row
}

const releaseQuote = defineTool({
  name: 'release_quote',
  title: 'Release quote',
  description: "Byte-Back operations: release the quote on a submitted order (moves it to Quoted and notifies the reseller/customer). The amount is the system's pricing. Two steps: preview, then confirm.",
  scope: 'write',
  requiresUser: true,
  platformOnly: true,
  input: z.object({
    order: z.string().min(1).max(64).describe('Order number or id.'),
    validity_days: z.number().int().min(1).max(365).default(30).describe('How long the quote stays valid.'),
    confirm_token: z.string().max(2000).optional().describe('Leave out to preview; then call again with it.'),
  }).strict(),
  annotations: WRITE,
  async run(ctx, a) {
    return twoStep(ctx, 'release_quote', a, async () => {
      const o = await findAnyOrder(ctx, a.order)
      if (o.status !== 'submitted') throw new ToolError('not_allowed', `Order ${o.order_number} is "${label(o.status)}"; only submitted orders can be quoted.`)
      return {
        order: o.order_number, type: o.type,
        reseller: one(o.tenant as { name?: string } | null)?.name ?? null,
        customer: one(o.customer as { company_name?: string } | null)?.company_name ?? null,
        devices: o.total_quantity ?? null,
        quote_amount: o.quoted_amount ?? o.total_amount ?? null, currency: 'CAD',
        valid_for_days: a.validity_days,
      }
    }, async () => {
      const o = await findAnyOrder(ctx, a.order)
      const updated = await asUser(ctx, () => transitionRoute(
        internal(ctx, `/api/orders/${o.id}/transition`, { to_status: 'quoted', validity_days: a.validity_days, notes: `Via ${ctx.user!.clientName} (AI assistant)` }),
        { params: Promise.resolve({ id: o.id as string }) },
      ))
      return { order: o.order_number, order_status: label(updated.status ?? 'quoted'), quote_expires_at: updated.quote_expires_at ?? null }
    })
  },
})

export const OPS_TOOLS: McpTool[] = [opsQueue, releaseQuote] as unknown as McpTool[]
