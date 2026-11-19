// ============================================================================
// MCP WRITE TOOLS — Phase 2 (OAuth, signed-in user, two-step confirm)
// ============================================================================
// Every action is performed by the app's OWN route handler, called in-process
// while running AS the signed-in user (runAsUser). requireAuth() inside the
// route resolves to that user and the database client runs under their RLS,
// so the assistant can never do anything the person couldn't do in DLM, and
// every validation, scope rule, state-machine check, audit row and
// notification is the web app's, unchanged. Tools here only add a preview
// and the confirm step.

import { NextRequest } from 'next/server'
import { z } from 'zod/v4'
import { tenantQuery, asRow } from '@/lib/public-api'
import { VALID_ORDER_TRANSITIONS, ORDER_STATUS_CONFIG } from '@/lib/constants'
import { DEVICE_CONDITION_VALUES } from '@/lib/validations'
import { runAsUser } from '@/lib/supabase/acting-user'
import { userAccessToken } from '@/lib/supabase/impersonation-session'
import { POST as createOrderRoute } from '@/app/api/orders/route'
import { POST as transitionRoute } from '@/app/api/orders/[id]/transition/route'
import { POST as manageCustomerRoute } from '@/app/api/customers/[id]/manage/route'
import { POST as shipmentsRoute } from '@/app/api/shipments/route'
import { defineTool, ToolError, WRITE, DESTRUCTIVE, type McpContext, type McpTool, type McpUser } from './registry'
import { customerVisible, estimateFor, ID_PATTERN } from './tools'
import { issueConfirmToken, checkConfirmToken, claimConfirmation, recordConfirmationResult } from './confirm'

const confirmField = z.string().max(2000).optional()
  .describe('Leave out to PREVIEW. After the user agrees to the preview, call again with the same arguments plus this token.')
const orderRef = z.string().min(1).max(64).describe('Order UUID or order number (e.g. PO-2026-2141).')

export function needUser(ctx: McpContext): McpUser {
  if (!ctx.user) throw new ToolError('user_required', 'This action needs a signed-in connection (OAuth), not an organization API key.')
  return ctx.user
}

/** Call an app route handler as the signed-in user; returns its JSON or throws its refusal. */
export async function asUser(ctx: McpContext, call: () => Promise<Response>): Promise<Record<string, unknown>> {
  const user = needUser(ctx)
  const accessToken = await userAccessToken(`mcp:${user.id}`, user.id)
  const res = await runAsUser({ userId: user.id, accessToken }, call)
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new ToolError(res.status === 403 ? 'not_allowed' : res.status === 404 ? 'not_found' : 'refused', String(body.error ?? `Refused (${res.status}).`))
  }
  return body
}

export const internal = (ctx: McpContext, path: string, body: unknown) => new NextRequest(`http://dlm.internal${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': `mcp-${ctx.user?.id ?? 'anon'}` },
  body: JSON.stringify(body),
})

/** Preview → (user agrees) → confirm, single-use, re-validated at confirm time. */
export async function twoStep<A extends { confirm_token?: string }>(
  ctx: McpContext, tool: string, args: A,
  preview: () => Promise<Record<string, unknown>>,
  act: () => Promise<Record<string, unknown>>,
) {
  const user = needUser(ctx)
  const { confirm_token, ...rest } = args
  const shown = await preview() // also re-validates current state at confirm time
  if (!confirm_token) {
    return {
      status: 'preview',
      ...shown,
      confirm_token: issueConfirmToken(tool, rest, user.id),
      next: `Show this to the user. Only if they agree, call ${tool} again with the same arguments plus confirm_token (valid 10 minutes).`,
    }
  }
  const chk = checkConfirmToken(confirm_token, tool, rest, user.id)
  if (!chk.ok) throw new ToolError('confirm_invalid', chk.reason)
  const claim = await claimConfirmation(ctx.supabase, confirm_token, user.id, tool)
  if (claim !== 'claimed') return claim.replay as Record<string, unknown>
  try {
    const out = { status: 'done', ...(await act()) }
    await recordConfirmationResult(ctx.supabase, confirm_token, out)
    return out
  } catch (err) {
    // The token is spent; record why, so a replay explains it. Fixing the
    // problem means a fresh preview (and a new token).
    await recordConfirmationResult(ctx.supabase, confirm_token, { status: 'failed', error: err instanceof Error ? err.message : 'failed' })
    throw err
  }
}

async function resolveOrder(ctx: McpContext, ref: string) {
  const isId = ID_PATTERN.test(ref.trim())
  const { data } = await tenantQuery(ctx, 'orders', 'id, order_number, type, status, customer_id, quoted_amount, total_amount, quote_expires_at')
    .eq(isId ? 'id' : 'order_number', ref.trim()).maybeSingle()
  const row = asRow(data)
  if (!row || !(await customerVisible(ctx, row.customer_id as string))) throw new ToolError('not_found', `No order "${ref}" visible to you.`)
  return row
}

const label = (s: unknown) => ORDER_STATUS_CONFIG[s as keyof typeof ORDER_STATUS_CONFIG]?.label ?? String(s)

// ── create_trade_in_order ───────────────────────────────────────────────────
const createTradeIn = defineTool({
  name: 'create_trade_in_order',
  title: 'Create trade-in order',
  description: 'Create a DRAFT trade-in order for one of your customers. Two steps: call without confirm_token to preview (devices + estimate), show it to the user, then call again with confirm_token. Use submit_order afterwards to send it for a quote.',
  scope: 'write',
  requiresUser: true,
  input: z.object({
    customer_id: z.string().regex(ID_PATTERN).describe('Customer id (from list_customers).'),
    items: z.array(z.object({
      device_id: z.string().regex(ID_PATTERN).describe('Catalog device id (from search_device_catalog).'),
      quantity: z.number().int().min(1).max(500),
      condition: z.enum(DEVICE_CONDITION_VALUES).default('good'),
      storage: z.string().regex(/^\d+(GB|TB)$/i).default('128GB'),
    }).strict()).min(1).max(50),
    confirm_token: confirmField,
  }).strict(),
  annotations: WRITE,
  async run(ctx, a) {
    return twoStep(ctx, 'create_trade_in_order', a, async () => {
      if (!(await customerVisible(ctx, a.customer_id))) throw new ToolError('not_found', 'No such customer visible to you.')
      const { data: cust } = await tenantQuery(ctx, 'customers', 'company_name').eq('id', a.customer_id).maybeSingle()
      const lines = []
      let low = 0, high = 0, complete = true
      for (const it of a.items) {
        const e = await estimateFor(ctx, it.device_id, it.storage, it.condition)
        if (e.estimate_available) { low += e.estimate_low * it.quantity; high += e.estimate_high * it.quantity } else complete = false
        lines.push({ device: `${e.device.make} ${e.device.model}`, storage: e.storage, condition: it.condition, quantity: it.quantity,
          unit_estimate: e.estimate_available ? `${e.estimate_low}–${e.estimate_high} CAD` : 'not available' })
      }
      return {
        customer: (cust as { company_name?: string } | null)?.company_name ?? a.customer_id,
        lines,
        estimated_total: complete ? `${low}–${high} CAD` : 'partial (some devices have no estimate)',
        note: 'Estimates are indicative; the final value is set after inspection.',
      }
    }, async () => {
      const order = await asUser(ctx, () => createOrderRoute(internal(ctx, '/api/orders', {
        customer_id: a.customer_id, type: 'trade_in', items: a.items,
      })))
      const o = ((order as { data?: Record<string, unknown> }).data ?? order) as Record<string, unknown>
      return { order_id: o.id, order_number: o.order_number, order_status: o.status, next: 'Call submit_order to send it to Byte-Back for a quote.' }
    })
  },
})

// ── status changes (submit / accept / reject / cancel) ─────────────────────
function transitionTool(cfg: {
  name: string; title: string; to: string; description: string; destructive?: boolean; from?: string[]
}) {
  return defineTool({
    name: cfg.name,
    title: cfg.title,
    description: `${cfg.description} Two steps: preview without confirm_token, show the user, then call again with confirm_token.`,
    scope: 'write',
    requiresUser: true,
    input: z.object({
      order: orderRef,
      note: z.string().max(500).optional().describe('Optional note recorded on the order timeline.'),
      confirm_token: confirmField,
    }).strict(),
    annotations: cfg.destructive ? DESTRUCTIVE : WRITE,
    async run(ctx, a) {
      return twoStep(ctx, cfg.name, a, async () => {
        const o = await resolveOrder(ctx, a.order)
        const next = VALID_ORDER_TRANSITIONS[o.status as keyof typeof VALID_ORDER_TRANSITIONS] ?? []
        if (!(next as string[]).includes(cfg.to) || (cfg.from && !cfg.from.includes(o.status as string))) {
          throw new ToolError('not_allowed', `Order ${o.order_number} is "${label(o.status)}"; it can't move to "${label(cfg.to)}".`)
        }
        return {
          order: o.order_number, type: o.type, current_status: label(o.status), new_status: label(cfg.to),
          amount: o.quoted_amount ?? o.total_amount ?? null, quote_expires_at: o.quote_expires_at ?? null,
        }
      }, async () => {
        const o = await resolveOrder(ctx, a.order)
        const via = `Via ${ctx.user!.clientName} (AI assistant)`
        const updated = await asUser(ctx, () => transitionRoute(
          internal(ctx, `/api/orders/${o.id}/transition`, { to_status: cfg.to, notes: a.note ? `${a.note} — ${via}` : via }),
          { params: Promise.resolve({ id: o.id as string }) },
        ))
        return { order: o.order_number, order_status: (updated.status as string) ?? cfg.to }
      })
    },
  })
}

const submitOrder = transitionTool({ name: 'submit_order', title: 'Submit order', to: 'submitted', from: ['draft'],
  description: 'Send a draft order to Byte-Back for pricing/quote.' })
const acceptQuote = transitionTool({ name: 'accept_quote', title: 'Accept quote for customer', to: 'accepted', from: ['quoted'],
  description: "Accept a quoted order on the customer's behalf (after the customer agreed, e.g. by email). The customer is sent the full terms." })
const rejectQuote = transitionTool({ name: 'reject_quote', title: 'Reject quote for customer', to: 'rejected', destructive: true,
  description: "Reject a quote on the customer's behalf." })
const cancelOrder = transitionTool({ name: 'cancel_order', title: 'Cancel order', to: 'cancelled', destructive: true,
  description: 'Cancel an order that has not been processed yet.' })

// ── assign_customer_rep ─────────────────────────────────────────────────────
const assignRep = defineTool({
  name: 'assign_customer_rep',
  title: 'Assign customer to a rep',
  description: 'Assign one of your customers to a sales rep (or unassign with rep_id null). Administrators and regional managers only. Two steps: preview, then confirm.',
  scope: 'write',
  requiresUser: true,
  input: z.object({
    customer_id: z.string().regex(ID_PATTERN),
    rep_id: z.string().regex(ID_PATTERN).nullable().describe('Sales rep user id, or null to unassign.'),
    confirm_token: confirmField,
  }).strict(),
  annotations: WRITE,
  async run(ctx, a) {
    return twoStep(ctx, 'assign_customer_rep', a, async () => {
      if (!(await customerVisible(ctx, a.customer_id))) throw new ToolError('not_found', 'No such customer visible to you.')
      const { data: cust } = await tenantQuery(ctx, 'customers', 'company_name, region').eq('id', a.customer_id).maybeSingle()
      let repName: string | null = null
      if (a.rep_id) {
        const { data: rep } = await ctx.supabase.from('users').select('full_name, role, tenant_id, is_active')
          .eq('id', a.rep_id).maybeSingle()
        if (!rep || rep.tenant_id !== ctx.tenantId || rep.role !== 'var_sales_rep' || rep.is_active === false) {
          throw new ToolError('not_found', 'No such active sales rep in your organization.')
        }
        repName = rep.full_name as string
      }
      return { customer: (cust as { company_name?: string } | null)?.company_name, region: (cust as { region?: string } | null)?.region ?? null, assign_to: repName ?? '(unassigned)' }
    }, async () => {
      await asUser(ctx, () => manageCustomerRoute(
        internal(ctx, `/api/customers/${a.customer_id}/manage`, { action: 'assign', repId: a.rep_id }),
        { params: Promise.resolve({ id: a.customer_id }) },
      ))
      return { customer_id: a.customer_id, assigned_rep_id: a.rep_id }
    })
  },
})

// ── record_ship_in ──────────────────────────────────────────────────────────
const recordShipIn = defineTool({
  name: 'record_ship_in',
  title: 'Record customer ship-in',
  description: "Record the carrier and tracking number when your customer has shipped the devices of an accepted trade-in to the COE (for customers who don't log in themselves). Moves the order to \"shipped to COE\". Two steps: preview, then confirm.",
  scope: 'write',
  requiresUser: true,
  input: z.object({
    order: orderRef,
    carrier: z.string().min(2).max(60).describe('e.g. Canada Post, Purolator, UPS, FedEx.'),
    tracking_number: z.string().min(4).max(60),
    confirm_token: confirmField,
  }).strict(),
  annotations: WRITE,
  async run(ctx, a) {
    return twoStep(ctx, 'record_ship_in', a, async () => {
      const o = await resolveOrder(ctx, a.order)
      if (o.type !== 'trade_in' || o.status !== 'accepted') {
        throw new ToolError('not_allowed', `Order ${o.order_number} is "${label(o.status)}"; ship-in can be recorded once a trade-in quote is accepted.`)
      }
      return { order: o.order_number, carrier: a.carrier, tracking_number: a.tracking_number, new_status: label('shipped_to_coe') }
    }, async () => {
      const o = await resolveOrder(ctx, a.order)
      const s = await asUser(ctx, () => shipmentsRoute(internal(ctx, '/api/shipments', {
        order_id: o.id, carrier: a.carrier, tracking_number: a.tracking_number.trim(), direction: 'inbound',
        from_address: {}, to_address: {},
      })))
      return { order: o.order_number, shipment_id: s.id, order_status: label('shipped_to_coe') }
    })
  },
})

export const WRITE_TOOLS: McpTool[] = [
  createTradeIn, submitOrder, acceptQuote, rejectQuote, cancelOrder, assignRep, recordShipIn,
] as unknown as McpTool[]
