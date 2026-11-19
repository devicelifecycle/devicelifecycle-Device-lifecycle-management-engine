// ============================================================================
// MCP TOOLS — Phase 1 (read-only, API-key auth)
// ============================================================================
// Thin wrappers over the public API v1 data layer: every query starts from
// tenantQuery() (tenant filter applied before anything else) and every row
// leaves through the v1 serializer whitelist, so the connector can never show
// more than /api/v1 does.

import { z } from 'zod/v4'
import { tenantQuery, asRow, asRows, API_VERSION } from '@/lib/public-api'
import {
  ORDER_COLUMNS, ORDER_ITEM_COLUMNS, DEVICE_CATALOG_COLUMNS, CUSTOMER_COLUMNS, ASSET_COLUMNS,
  serializeOrder, serializeOrderDetail, serializeCustomer, serializeAsset, serializeDevice,
} from '@/lib/public-api/serializers'
import { ORDER_STATUS_CONFIG, VALID_ORDER_TRANSITIONS } from '@/lib/constants'
import { DEVICE_CONDITION_VALUES } from '@/lib/validations'
import { sanitizeSearchInput } from '@/lib/utils'
import { PricingService } from '@/services/pricing.service'
import { customerScopeFilter, customerInVarScope, delegationLevel, type ScopeFilter } from '@/lib/delegation'
import { defineTool, READ_ONLY, ToolError, type McpTool, type McpContext } from './registry'

const ORDER_STATUSES = Object.keys(ORDER_STATUS_CONFIG) as [string, ...string[]]
/** Statuses with no onward transition: the order is finished. */
export const TERMINAL_STATUSES = new Set(
  Object.entries(VALID_ORDER_TRANSITIONS).filter(([, next]) => next.length === 0).map(([s]) => s),
)

/** MCP pages are smaller than v1's (≤50, default 20): results go into a model's context. */
const page = {
  limit: z.number().int().min(1).max(50).default(20).describe('Rows to return (1-50, default 20).'),
  offset: z.number().int().min(0).max(100_000).default(0).describe('Rows to skip, for paging.'),
}
// Same shape check as isValidUUID(). Not z.uuid(): zod v4 enforces RFC 9562
// version bits, and DLM's seeded ids (catalog devices, platform rows such as
// d0010000-0000-0000-0000-000000000010) don't carry them — every estimate on a
// seeded device was refused.
const ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = (what: string) => z.string().regex(ID_PATTERN, 'Expected an id like 3f2b…-…').describe(`${what} id (UUID).`)

function listResult<T>(rows: T[], limit: number, offset: number, total: number | null) {
  const t = total ?? rows.length
  return {
    data: rows,
    page: { limit, offset, total: t, has_more: offset + rows.length < t },
  }
}

/**
 * With a signed-in user (OAuth), narrow to that user's own scope — a rep to
 * customers assigned to them, a regional manager to their region — exactly
 * like the web app. API keys are organization-wide (null).
 */
export function userScope(ctx: McpContext): ScopeFilter | null {
  return ctx.user ? customerScopeFilter({ role: ctx.user.role, userId: ctx.user.id, region: ctx.user.region }) : null
}

/** Is this customer visible to the caller? (Out of scope reads as not found.) */
export async function customerVisible(ctx: McpContext, customerId: string | null | undefined): Promise<boolean> {
  if (!customerId) return false
  // API keys and Byte-Back staff: the tenant filter on every query is the scope.
  if (!ctx.user || delegationLevel(ctx.user.role) === 'none') return true
  const { data } = await tenantQuery(ctx, 'customers', 'tenant_id, region, assigned_rep_id').eq('id', customerId).maybeSingle()
  return customerInVarScope({ role: ctx.user.role, userId: ctx.user.id, region: ctx.user.region, tenantId: ctx.tenantId }, asRow(data))
}

function dbFail(what: string, err: unknown): never {
  console.error(`mcp: ${what} failed`, err)
  throw new ToolError('internal', `Could not load ${what}. Try again shortly.`)
}

const whoami = defineTool({
  name: 'whoami',
  title: 'Who am I',
  description: 'Identify the connected DLM account: organization name, API key scopes and API version. Call this first if unsure what data is available.',
  scope: null,
  input: z.object({}).strict(),
  annotations: READ_ONLY,
  async run(ctx) {
    const { data } = await ctx.supabase.from('tenants').select('id, name, slug').eq('id', ctx.tenantId).maybeSingle()
    return {
      api_version: API_VERSION,
      organization: data ? { id: data.id, name: data.name, slug: data.slug } : { id: ctx.tenantId },
      scopes: ctx.key.scopes,
    }
  },
})

const listOrders = defineTool({
  name: 'list_orders',
  title: 'List orders',
  description: 'List trade-in and CPO orders, newest first. Filter by status, type, customer, or orders changed since a time. Returns order summaries (number, status, amounts, key dates); use get_order for line items.',
  scope: 'read',
  input: z.object({
    status: z.enum(ORDER_STATUSES).optional().describe('Only this status. See resource dlm://reference/order-statuses.'),
    type: z.enum(['trade_in', 'cpo']).optional().describe('trade_in (customer sells devices) or cpo (customer buys certified pre-owned).'),
    customer_id: uuid('Customer').optional(),
    updated_since: z.string().datetime({ offset: true }).optional().describe('ISO-8601 time; only orders updated at or after it.'),
    ...page,
  }).strict(),
  annotations: READ_ONLY,
  async run(ctx, a) {
    const scope = userScope(ctx)
    let q = tenantQuery(ctx, 'orders', scope ? `${ORDER_COLUMNS}, customer:customers!inner(id)` : ORDER_COLUMNS, { count: 'exact' })
    if (scope) q = q.eq(`customer.${scope.column}`, scope.value)
    if (a.status) q = q.eq('status', a.status)
    if (a.type) q = q.eq('type', a.type)
    if (a.customer_id) q = q.eq('customer_id', a.customer_id)
    if (a.updated_since) q = q.gte('updated_at', new Date(a.updated_since).toISOString())
    const { data, error, count } = await q.order('created_at', { ascending: false }).range(a.offset, a.offset + a.limit - 1)
    if (error) dbFail('orders', error)
    return listResult(asRows(data).map(serializeOrder), a.limit, a.offset, count)
  },
})

const getOrder = defineTool({
  name: 'get_order',
  title: 'Get order',
  description: 'One order with its line items (device, quantity, storage, claimed/actual condition, quoted/final price). Accepts the order UUID or the order number (e.g. PO-2026-2141).',
  scope: 'read',
  input: z.object({
    order: z.string().min(1).max(64).describe('Order UUID or order number.'),
  }).strict(),
  annotations: READ_ONLY,
  async run(ctx, a) {
    const columns = `${ORDER_COLUMNS}, items:order_items(${ORDER_ITEM_COLUMNS}, device:device_catalog(${DEVICE_CATALOG_COLUMNS}))`
    const isId = ID_PATTERN.test(a.order.trim())
    const { data, error } = await tenantQuery(ctx, 'orders', columns)
      .eq(isId ? 'id' : 'order_number', a.order.trim()).maybeSingle()
    if (error) dbFail('order', error)
    const row = asRow(data)
    // Wrong-tenant, out-of-scope and nonexistent look identical.
    if (!row || !(await customerVisible(ctx, row.customer_id as string))) {
      throw new ToolError('not_found', `No order "${a.order}" visible to you.`)
    }
    return { data: serializeOrderDetail(row) }
  },
})

const listCustomers = defineTool({
  name: 'list_customers',
  title: 'List customers',
  description: 'List customer companies, alphabetically. Optional text search over company name, contact name and email.',
  scope: 'read',
  input: z.object({
    query: z.string().max(100).optional().describe('Text to search for.'),
    is_active: z.boolean().optional().describe('Only active (true) or inactive (false) customers.'),
    ...page,
  }).strict(),
  annotations: READ_ONLY,
  async run(ctx, a) {
    const text = sanitizeSearchInput(a.query?.trim() ?? '')
    const scope = userScope(ctx)
    let q = tenantQuery(ctx, 'customers', CUSTOMER_COLUMNS, { count: 'exact' })
    if (scope) q = q.eq(scope.column, scope.value)
    if (a.is_active !== undefined) q = q.eq('is_active', a.is_active)
    if (text) q = q.or(`company_name.ilike.%${text}%,contact_name.ilike.%${text}%,contact_email.ilike.%${text}%`)
    const { data, error, count } = await q.order('company_name', { ascending: true }).range(a.offset, a.offset + a.limit - 1)
    if (error) dbFail('customers', error)
    return listResult(asRows(data).map(serializeCustomer), a.limit, a.offset, count)
  },
})

const getCustomer = defineTool({
  name: 'get_customer',
  title: 'Get customer',
  description: 'One customer company with contact details, plus its order counts by status.',
  scope: 'read',
  input: z.object({ customer_id: uuid('Customer') }).strict(),
  annotations: READ_ONLY,
  async run(ctx, a) {
    const { data, error } = await tenantQuery(ctx, 'customers', CUSTOMER_COLUMNS).eq('id', a.customer_id).maybeSingle()
    if (error) dbFail('customer', error)
    const row = asRow(data)
    if (!row || !(await customerVisible(ctx, a.customer_id))) throw new ToolError('not_found', 'No such customer visible to you.')
    const { data: orders, error: oErr } = await tenantQuery(ctx, 'orders', 'status')
      .eq('customer_id', a.customer_id).limit(5000)
    if (oErr) dbFail('customer orders', oErr)
    const byStatus: Record<string, number> = {}
    for (const o of asRows(orders)) byStatus[o.status as string] = (byStatus[o.status as string] ?? 0) + 1
    return { data: { ...serializeCustomer(row), order_counts: byStatus } }
  },
})

const listDevices = defineTool({
  name: 'list_devices',
  title: 'List registered devices',
  description: "The organization's device register: customer-owned devices with label, serial, status (registered / assigned / retired), assignee and location.",
  scope: 'read',
  input: z.object({
    customer_id: uuid('Customer').optional(),
    status: z.enum(['registered', 'assigned', 'retired']).optional(),
    ...page,
  }).strict(),
  annotations: READ_ONLY,
  async run(ctx, a) {
    const scope = userScope(ctx)
    let q = tenantQuery(ctx, 'customer_assets',
      `${ASSET_COLUMNS}, device:device_catalog(${DEVICE_CATALOG_COLUMNS})${scope ? ', customer:customers!inner(id)' : ''}`, { count: 'exact' })
    if (scope) q = q.eq(`customer.${scope.column}`, scope.value)
    if (a.customer_id) q = q.eq('customer_id', a.customer_id)
    if (a.status) q = q.eq('status', a.status)
    const { data, error, count } = await q.order('created_at', { ascending: false }).range(a.offset, a.offset + a.limit - 1)
    if (error) dbFail('devices', error)
    return listResult(asRows(data).map(serializeAsset), a.limit, a.offset, count)
  },
})

const searchCatalog = defineTool({
  name: 'search_device_catalog',
  title: 'Search device catalog',
  description: 'Find device models (make/model/variant/category) to quote. Use the returned device id with estimate_trade_in_value.',
  scope: 'read',
  input: z.object({
    query: z.string().min(2).max(100).describe('Make or model text, e.g. "iPhone 13" or "Galaxy S23".'),
  }).strict(),
  annotations: READ_ONLY,
  async run(ctx, a) {
    const text = sanitizeSearchInput(a.query.trim())
    if (text.length < 2) return { data: [] }
    // Global catalog (not tenant data): active models only.
    const { data, error } = await ctx.supabase.from('device_catalog').select(DEVICE_CATALOG_COLUMNS)
      .eq('is_active', true).or(`make.ilike.%${text}%,model.ilike.%${text}%`).order('make').limit(15)
    if (error) dbFail('catalog', error)
    return { data: asRows(data).map(serializeDevice) }
  },
})

const estimate = defineTool({
  name: 'estimate_trade_in_value',
  title: 'Estimate trade-in value',
  description: 'Indicative trade-in value range (CAD, unlocked, quantity 1) for a catalog device in a given condition. An estimate only: the final value is set after inspection.',
  scope: 'read',
  input: z.object({
    device_id: uuid('Catalog device (from search_device_catalog)'),
    storage: z.string().regex(/^\d+(GB|TB)$/i).default('128GB').describe('Storage, e.g. 128GB or 1TB.'),
    condition: z.enum(DEVICE_CONDITION_VALUES).default('good').describe('See resource dlm://reference/device-conditions.'),
  }).strict(),
  annotations: READ_ONLY,
  async run(ctx, a) {
    return estimateFor(ctx, a.device_id, a.storage, a.condition)
  },
})

/**
 * Indicative per-unit trade-in range for one catalog device. Same rounding as
 * the public value lookup: ±10% to the nearest $5, never the exact price.
 */
export async function estimateFor(ctx: McpContext, deviceId: string, storageRaw: string, condition: typeof DEVICE_CONDITION_VALUES[number]) {
  const { data: device } = await ctx.supabase.from('device_catalog').select('id, make, model')
    .eq('id', deviceId).eq('is_active', true).maybeSingle()
  if (!device) throw new ToolError('not_found', `No active catalog device ${deviceId}.`)
  const storage = storageRaw.toUpperCase()
  const calc = await PricingService.calculateAdaptivePrice(
    { device_id: deviceId, storage, carrier: 'Unlocked', condition, quantity: 1 },
    ctx.supabase,
  )
  const base = { device: { make: device.make as string, model: device.model as string }, storage, condition, currency: 'CAD' }
  if (!calc.success || calc.trade_price == null) return { ...base, estimate_available: false as const }
  const rounded = Math.round(calc.trade_price / 5) * 5
  return {
    ...base,
    estimate_available: true as const,
    estimate_low: Math.max(0, Math.round((rounded * 0.9) / 5) * 5),
    estimate_high: Math.round((rounded * 1.1) / 5) * 5,
  }
}

const PIPELINE_CAP = 5000
const pipeline = defineTool({
  name: 'order_pipeline_summary',
  title: 'Order pipeline summary',
  description: 'Counts and value of orders by status, open vs finished, SLA-breached open orders and the oldest open order. Good for "what is in flight" questions.',
  scope: 'read',
  input: z.object({
    type: z.enum(['trade_in', 'cpo']).optional(),
    created_since: z.string().datetime({ offset: true }).optional().describe('Only orders created at or after this ISO-8601 time.'),
  }).strict(),
  annotations: READ_ONLY,
  async run(ctx, a) {
    const scope = userScope(ctx)
    let q = tenantQuery(ctx, 'orders',
      `order_number, status, total_amount, quoted_amount, final_amount, created_at, is_sla_breached${scope ? ', customer:customers!inner(id)' : ''}`, { count: 'exact' })
    if (scope) q = q.eq(`customer.${scope.column}`, scope.value)
    if (a.type) q = q.eq('type', a.type)
    if (a.created_since) q = q.gte('created_at', new Date(a.created_since).toISOString())
    const { data, error, count } = await q.order('created_at', { ascending: false }).limit(PIPELINE_CAP)
    if (error) dbFail('pipeline', error)
    const rows = asRows(data)
    const byStatus = new Map<string, { count: number; value: number }>()
    let open = 0, slaBreachedOpen = 0
    let oldestOpen: { order_number: unknown; created_at: string } | null = null
    for (const r of rows) {
      const s = r.status as string
      const v = Number(r.final_amount ?? r.quoted_amount ?? r.total_amount ?? 0) || 0
      const e = byStatus.get(s) ?? { count: 0, value: 0 }
      e.count++; e.value += v
      byStatus.set(s, e)
      if (!TERMINAL_STATUSES.has(s)) {
        open++
        if (r.is_sla_breached) slaBreachedOpen++
        if (!oldestOpen || String(r.created_at) < oldestOpen.created_at) {
          oldestOpen = { order_number: r.order_number, created_at: String(r.created_at) }
        }
      }
    }
    return {
      total_orders: count ?? rows.length,
      counted: rows.length,
      truncated: (count ?? 0) > rows.length,
      open_orders: open,
      finished_orders: rows.length - open,
      sla_breached_open: slaBreachedOpen,
      oldest_open: oldestOpen
        ? { ...oldestOpen, age_days: Math.floor((Date.now() - Date.parse(oldestOpen.created_at)) / 86_400_000) }
        : null,
      by_status: [...byStatus.entries()]
        .map(([status, e]) => ({
          status,
          label: ORDER_STATUS_CONFIG[status as keyof typeof ORDER_STATUS_CONFIG]?.label ?? status,
          finished: TERMINAL_STATUSES.has(status),
          count: e.count,
          value: Math.round(e.value * 100) / 100,
        }))
        .sort((x, y) => y.count - x.count),
      currency: 'CAD',
    }
  },
})

export const READ_TOOLS: McpTool[] = [
  whoami, listOrders, getOrder, listCustomers, getCustomer, listDevices, searchCatalog, estimate, pipeline,
] as unknown as McpTool[]

export { ID_PATTERN }
