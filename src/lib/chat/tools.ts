// ============================================================================
// AI ASSISTANT TOOL DEFINITIONS
// ============================================================================
// These tools let the AI query the platform's data via Supabase.
// Each tool maps to a DB query scoped by user role.

import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { UserRole } from '@/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabase() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Chat tools require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Sanitize search input for PostgREST .or() filters — strip chars that break filter syntax */
function sanitizeSearch(input: string): string {
  return input.replace(/[(),."'\\%_]/g, '').trim().slice(0, 100)
}

interface ToolContext {
  userId: string
  role: UserRole
  organizationId?: string
}

// ============================================================================
// TOOL DEFINITIONS (for Groq function calling)
// ============================================================================

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_orders',
      description: 'Search orders by status, customer name, or order number. Returns recent orders with key details.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status: draft, submitted, accepted, quoted, rejected, cancelled, received, triage, qc_complete, ready_to_ship, shipped, delivered, closed, exception' },
          search: { type: 'string', description: 'Search by order number or customer name' },
          limit: { type: 'number', description: 'Max results (default 5)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_order_details',
      description: 'Get full details of a specific order by order number or ID, including items, status, and timeline.',
      parameters: {
        type: 'object',
        properties: {
          order_identifier: { type: 'string', description: 'Order number (e.g. ORD-2026-0001) or order UUID' },
        },
        required: ['order_identifier'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_device_price',
      description: 'Get the trade-in or CPO price for a device. Looks up market prices and pricing tables.',
      parameters: {
        type: 'object',
        properties: {
          device_name: { type: 'string', description: 'Device name to search for (e.g. "iPhone 15 Pro", "Samsung Galaxy S24")' },
          condition: { type: 'string', description: 'Device condition: new, excellent, good, fair, poor. Default: good' },
          storage: { type: 'string', description: 'Storage variant (e.g. "128GB", "256GB"). Default: 128GB' },
        },
        required: ['device_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_platform_stats',
      description: 'Get platform overview: total orders, orders by status, SLA breaches, recent activity.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_devices',
      description: 'Search the device catalog by make, model, or category.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (e.g. "iPhone", "Samsung", "MacBook")' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_shipment_tracking',
      description: 'Get shipment tracking info for an order.',
      parameters: {
        type: 'object',
        properties: {
          order_identifier: { type: 'string', description: 'Order number or order ID to look up shipment for' },
        },
        required: ['order_identifier'],
      },
    },
  },
]

// Tools available per role (customers/vendors get restricted set)
const INTERNAL_ROLES: UserRole[] = ['admin', 'coe_manager', 'coe_tech', 'sales']

export function getToolsForRole(role: UserRole) {
  if (INTERNAL_ROLES.includes(role)) {
    return TOOL_DEFINITIONS
  }
  // Customers/vendors: no platform stats
  return TOOL_DEFINITIONS.filter(t => t.function.name !== 'get_platform_stats')
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  try {
    switch (toolName) {
      case 'search_orders':
        return await searchOrders(args, ctx)
      case 'get_order_details':
        return await getOrderDetails(args, ctx)
      case 'get_device_price':
        return await getDevicePrice(args, ctx)
      case 'get_platform_stats':
        return await getPlatformStats(ctx)
      case 'search_devices':
        return await searchDevices(args)
      case 'get_shipment_tracking':
        return await getShipmentTracking(args, ctx)
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'Tool execution failed' })
  }
}

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

async function searchOrders(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const supabase = getSupabase()
  const limit = Math.min(Number(args.limit) || 5, 10)

  let query = supabase
    .from('orders')
    .select('id, order_number, type, status, total_amount, created_at, customer:customers(company_name)')
    .order('created_at', { ascending: false })
    .limit(limit)

  // Role scoping — look up entity IDs from organization, not use org ID directly
  if (ctx.role === 'customer' && ctx.organizationId) {
    const { data: customers } = await supabase
      .from('customers').select('id').eq('organization_id', ctx.organizationId)
    const customerIds = (customers || []).map((c: { id: string }) => c.id)
    if (customerIds.length === 0) return JSON.stringify({ message: 'No orders found.' })
    query = query.in('customer_id', customerIds)
  } else if (ctx.role === 'vendor' && ctx.organizationId) {
    const { data: vendors } = await supabase
      .from('vendors').select('id').eq('organization_id', ctx.organizationId)
    const vendorIds = (vendors || []).map((v: { id: string }) => v.id)
    if (vendorIds.length === 0) return JSON.stringify({ message: 'No orders found.' })
    query = query.in('vendor_id', vendorIds)
  }

  if (args.status) query = query.eq('status', args.status)
  if (args.search) {
    query = query.ilike('order_number', `%${sanitizeSearch(String(args.search))}%`)
  }

  const { data, error } = await query
  if (error) return JSON.stringify({ error: error.message })

  if (!data || data.length === 0) {
    return JSON.stringify({ message: 'No orders found matching your criteria.' })
  }

  const orders = data.map((o: Record<string, unknown>) => ({
    order_number: o.order_number,
    type: o.type,
    status: o.status,
    total: o.total_amount ? `$${o.total_amount}` : 'TBD',
    customer: (o.customer as Record<string, unknown>)?.company_name || 'N/A',
    created: new Date(o.created_at as string).toLocaleDateString('en-US', { timeZone: 'America/Toronto' }),
  }))

  return JSON.stringify({ orders, count: orders.length })
}

async function getOrderDetails(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const supabase = getSupabase()
  const identifier = String(args.order_identifier || '')

  let query = supabase
    .from('orders')
    .select(`
      id, order_number, type, status, total_amount, created_at, updated_at,
      customer_id, vendor_id, customer_notes, internal_notes,
      customer:customers(company_name, contact_email),
      vendor:vendors(company_name),
      items:order_items(device_id, quantity, storage, claimed_condition, unit_price,
        device:device_catalog(make, model))
    `)

  // Match by order_number or UUID
  if (identifier.startsWith('ORD-') || identifier.startsWith('ord-')) {
    query = query.ilike('order_number', identifier)
  } else {
    query = query.eq('id', identifier)
  }

  const { data, error } = await query.single()
  if (error) return JSON.stringify({ error: 'Order not found.' })

  // Role scoping check — verify ownership via organization, not direct ID comparison
  const order = data as Record<string, unknown>
  if (ctx.role === 'customer' && ctx.organizationId) {
    const { data: cust } = await supabase
      .from('customers').select('organization_id').eq('id', order.customer_id).single()
    if (!cust || cust.organization_id !== ctx.organizationId) {
      return JSON.stringify({ error: 'You do not have access to this order.' })
    }
  } else if (ctx.role === 'vendor' && ctx.organizationId) {
    const { data: vend } = await supabase
      .from('vendors').select('organization_id').eq('id', order.vendor_id).single()
    if (!vend || vend.organization_id !== ctx.organizationId) {
      return JSON.stringify({ error: 'You do not have access to this order.' })
    }
  }

  const items = (order.items as Array<Record<string, unknown>> || []).map(item => ({
    device: `${(item.device as Record<string, unknown>)?.make} ${(item.device as Record<string, unknown>)?.model}`,
    quantity: item.quantity,
    storage: item.storage || 'N/A',
    condition: item.claimed_condition,
    unit_price: item.unit_price ? `$${item.unit_price}` : 'Pending',
  }))

  return JSON.stringify({
    order_number: order.order_number,
    type: order.type,
    status: order.status,
    total: order.total_amount ? `$${order.total_amount}` : 'TBD',
    customer: (order.customer as Record<string, unknown>)?.company_name,
    vendor: (order.vendor as Record<string, unknown>)?.company_name || 'Not assigned',
    created: new Date(order.created_at as string).toLocaleDateString('en-US', { timeZone: 'America/Toronto' }),
    updated: new Date(order.updated_at as string).toLocaleDateString('en-US', { timeZone: 'America/Toronto' }),
    items,
    notes: ctx.role !== 'customer' ? order.internal_notes : undefined,
    customer_notes: order.customer_notes,
  })
}

async function getDevicePrice(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const supabase = getSupabase()
  const deviceName = String(args.device_name || '')
  const condition = String(args.condition || 'good')
  const storage = String(args.storage || '128GB')

  // Map user-friendly conditions to DB conditions
  const condMap: Record<string, string> = { new: 'excellent', excellent: 'excellent', good: 'good', fair: 'fair', poor: 'broken' }
  const dbCondition = condMap[condition] || 'good'

  // Search device catalog
  const { data: devices } = await supabase
    .from('device_catalog')
    .select('id, make, model, category')
    .or(`model.ilike.%${sanitizeSearch(deviceName)}%,make.ilike.%${sanitizeSearch(deviceName)}%`)
    .limit(3)

  if (!devices || devices.length === 0) {
    return JSON.stringify({ error: `No device found matching "${deviceName}". Try a different search term.` })
  }

  const device = devices[0]

  // Fetch competitor prices (primary source of truth; exclude Bell)
  const { data: competitorRows } = await supabase
    .from('competitor_prices')
    .select('competitor_name, condition, storage, trade_in_price, sell_price, scraped_at, updated_at')
    .eq('device_id', device.id)
    .eq('storage', storage)
    .neq('competitor_name', 'Bell')
    .order('updated_at', { ascending: false })

  const result: Record<string, unknown> = {
    device: `${device.make} ${device.model}`,
    category: device.category,
    storage,
    condition,
  }

  if (competitorRows && competitorRows.length > 0) {
    // Filter for the requested condition
    const conditionRows = competitorRows.filter(r => r.condition === dbCondition)
    const allConditions = Array.from(new Set(competitorRows.map(r => r.condition)))

    if (conditionRows.length > 0) {
      const trades = conditionRows.filter(r => r.trade_in_price != null).map(r => Number(r.trade_in_price))
      const sells = conditionRows.filter(r => r.sell_price != null).map(r => Number(r.sell_price))

      result.avg_trade_in_price = trades.length ? `$${(trades.reduce((a, b) => a + b, 0) / trades.length).toFixed(2)}` : 'N/A'
      result.avg_cpo_sell_price = sells.length ? `$${(sells.reduce((a, b) => a + b, 0) / sells.length).toFixed(2)}` : 'N/A'
      result.highest_trade_in = trades.length ? `$${Math.max(...trades).toFixed(2)}` : 'N/A'
      result.competitors = conditionRows.map(r => ({
        name: r.competitor_name,
        trade_in: r.trade_in_price ? `$${r.trade_in_price}` : 'N/A',
        sell: r.sell_price ? `$${r.sell_price}` : 'N/A',
        last_updated: r.scraped_at || r.updated_at,
      }))
    } else {
      result.message = `No data for "${condition}" condition. Available conditions: ${allConditions.join(', ')}`
    }

    // Summary for all conditions (helpful for quoting)
    if (INTERNAL_ROLES.includes(ctx.role)) {
      const summary: Record<string, { avg_trade: string; avg_sell: string }> = {}
      for (const cond of allConditions) {
        const rows = competitorRows.filter(r => r.condition === cond)
        const t = rows.filter(r => r.trade_in_price != null).map(r => Number(r.trade_in_price))
        const s = rows.filter(r => r.sell_price != null).map(r => Number(r.sell_price))
        summary[cond] = {
          avg_trade: t.length ? `$${(t.reduce((a, b) => a + b, 0) / t.length).toFixed(2)}` : 'N/A',
          avg_sell: s.length ? `$${(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2)}` : 'N/A',
        }
      }
      result.all_conditions = summary
    }

    result.source = 'competitor_prices'
  } else {
    result.message = 'No competitor pricing data available for this device/storage combination. Try running the price scraper from the admin panel.'
  }

  return JSON.stringify(result)
}

async function getPlatformStats(ctx: ToolContext): Promise<string> {
  if (!INTERNAL_ROLES.includes(ctx.role)) {
    return JSON.stringify({ error: 'Access denied.' })
  }

  const supabase = getSupabase()

  const [ordersRes, breachesRes, devicesRes] = await Promise.all([
    supabase.from('orders').select('status', { count: 'exact' }),
    supabase.from('sla_breaches').select('*', { count: 'exact', head: true }).eq('resolved', false),
    supabase.from('device_catalog').select('*', { count: 'exact', head: true }),
  ])

  const orders = ordersRes.data || []
  const statusCounts: Record<string, number> = {}
  for (const o of orders) {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
  }

  return JSON.stringify({
    total_orders: ordersRes.count ?? orders.length,
    orders_by_status: statusCounts,
    active_sla_breaches: breachesRes.count ?? 0,
    devices_in_catalog: devicesRes.count ?? 0,
  })
}

async function searchDevices(args: Record<string, unknown>): Promise<string> {
  const supabase = getSupabase()
  const query = String(args.query || '')

  const { data, error } = await supabase
    .from('device_catalog')
    .select('id, make, model, category')
    .or(`model.ilike.%${sanitizeSearch(query)}%,make.ilike.%${sanitizeSearch(query)}%`)
    .limit(8)

  if (error) return JSON.stringify({ error: error.message })
  if (!data || data.length === 0) {
    return JSON.stringify({ message: `No devices found matching "${query}".` })
  }

  return JSON.stringify({
    devices: data.map(d => ({
      name: `${d.make} ${d.model}`,
      category: d.category,
      id: d.id,
    })),
    count: data.length,
  })
}

async function getShipmentTracking(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const supabase = getSupabase()
  const identifier = String(args.order_identifier || '')

  // Find order first
  let orderQuery = supabase.from('orders').select('id, order_number, status, customer_id, vendor_id')
  if (identifier.startsWith('ORD-') || identifier.startsWith('ord-')) {
    orderQuery = orderQuery.ilike('order_number', identifier)
  } else {
    orderQuery = orderQuery.eq('id', identifier)
  }

  const { data: order } = await orderQuery.single()
  if (!order) return JSON.stringify({ error: 'Order not found.' })

  // Ownership check for external roles
  if (ctx.role === 'customer' && ctx.organizationId) {
    const { data: cust } = await supabase
      .from('customers').select('organization_id').eq('id', order.customer_id).single()
    if (!cust || cust.organization_id !== ctx.organizationId) {
      return JSON.stringify({ error: 'Access denied.' })
    }
  } else if (ctx.role === 'vendor' && ctx.organizationId) {
    const { data: vend } = await supabase
      .from('vendors').select('organization_id').eq('id', order.vendor_id).single()
    if (!vend || vend.organization_id !== ctx.organizationId) {
      return JSON.stringify({ error: 'Access denied.' })
    }
  }

  // Find shipments for this order
  const { data: shipments } = await supabase
    .from('shipments')
    .select('id, type, carrier, tracking_number, status, label_url, estimated_delivery, created_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })

  if (!shipments || shipments.length === 0) {
    return JSON.stringify({
      order_number: order.order_number,
      order_status: order.status,
      message: 'No shipments created for this order yet.',
    })
  }

  return JSON.stringify({
    order_number: order.order_number,
    order_status: order.status,
    shipments: shipments.map(s => ({
      type: s.type,
      carrier: s.carrier || 'Pending',
      tracking_number: s.tracking_number || 'Pending',
      status: s.status,
      estimated_delivery: s.estimated_delivery || 'TBD',
      label_url: s.label_url || null,
    })),
  })
}
