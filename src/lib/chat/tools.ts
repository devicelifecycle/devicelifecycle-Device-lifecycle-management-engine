// ============================================================================
// AI ASSISTANT TOOL DEFINITIONS
// ============================================================================
// These tools let the AI query the platform's data via Supabase.
// Each tool maps to a DB query scoped by user role.

import { createClient } from '@supabase/supabase-js'
import type { UserRole } from '@/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabase() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
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

  // Role scoping
  if (ctx.role === 'customer') {
    query = query.eq('customer_id', ctx.organizationId || ctx.userId)
  } else if (ctx.role === 'vendor') {
    query = query.eq('vendor_id', ctx.organizationId || ctx.userId)
  }

  if (args.status) query = query.eq('status', args.status)
  if (args.search) {
    query = query.ilike('order_number', `%${args.search}%`)
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
    created: new Date(o.created_at as string).toLocaleDateString(),
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
      customer_notes, internal_notes,
      customer:customers(company_name, email),
      vendor:vendors(company_name),
      items:order_items(device_id, quantity, storage, claimed_condition, quoted_price, final_price,
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

  // Role scoping check
  const order = data as Record<string, unknown>
  if (ctx.role === 'customer' && order.customer_id !== ctx.organizationId) {
    return JSON.stringify({ error: 'You do not have access to this order.' })
  }

  const items = (order.items as Array<Record<string, unknown>> || []).map(item => ({
    device: `${(item.device as Record<string, unknown>)?.make} ${(item.device as Record<string, unknown>)?.model}`,
    quantity: item.quantity,
    storage: item.storage || 'N/A',
    condition: item.claimed_condition,
    quoted_price: item.quoted_price ? `$${item.quoted_price}` : 'Pending',
    final_price: item.final_price ? `$${item.final_price}` : 'Pending',
  }))

  return JSON.stringify({
    order_number: order.order_number,
    type: order.type,
    status: order.status,
    total: order.total_amount ? `$${order.total_amount}` : 'TBD',
    customer: (order.customer as Record<string, unknown>)?.company_name,
    vendor: (order.vendor as Record<string, unknown>)?.company_name || 'Not assigned',
    created: new Date(order.created_at as string).toLocaleDateString(),
    updated: new Date(order.updated_at as string).toLocaleDateString(),
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

  // Search device catalog
  const { data: devices } = await supabase
    .from('device_catalog')
    .select('id, make, model, category')
    .or(`model.ilike.%${deviceName}%,make.ilike.%${deviceName}%`)
    .limit(3)

  if (!devices || devices.length === 0) {
    return JSON.stringify({ error: `No device found matching "${deviceName}". Try a different search term.` })
  }

  const device = devices[0]

  // Check market_prices
  const { data: mp } = await supabase
    .from('market_prices')
    .select('wholesale_c_stock, trade_price, marketplace_price, cpo_price')
    .eq('device_id', device.id)
    .eq('storage', storage)
    .eq('is_active', true)
    .order('effective_date', { ascending: false })
    .limit(1)
    .single()

  // Check pricing_tables as fallback
  const { data: pt } = await supabase
    .from('pricing_tables')
    .select('base_price')
    .eq('device_id', device.id)
    .eq('storage', storage)
    .eq('condition', 'new')
    .eq('is_active', true)
    .order('effective_date', { ascending: false })
    .limit(1)
    .single()

  // Condition multipliers
  const condMult: Record<string, number> = { new: 1.0, excellent: 0.95, good: 0.85, fair: 0.70, poor: 0.50 }
  const mult = condMult[condition] ?? 0.85

  const result: Record<string, unknown> = {
    device: `${device.make} ${device.model}`,
    category: device.category,
    storage,
    condition,
  }

  if (mp) {
    const tradePrice = mp.trade_price ? Number(mp.trade_price) * mult : null
    result.trade_in_price = tradePrice ? `$${tradePrice.toFixed(2)}` : 'N/A'
    result.cpo_price = mp.cpo_price ? `$${mp.cpo_price}` : 'N/A'
    if (INTERNAL_ROLES.includes(ctx.role)) {
      result.wholesale_c_stock = `$${mp.wholesale_c_stock}`
      result.marketplace_price = mp.marketplace_price ? `$${mp.marketplace_price}` : 'N/A'
    }
    result.source = 'market_prices'
  } else if (pt) {
    const basePrice = Number(pt.base_price)
    result.estimated_trade_price = `$${(basePrice * mult * 0.8).toFixed(2)}`
    result.source = 'pricing_table (estimate)'
  } else {
    result.message = 'No pricing data available for this device/storage combination.'
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
    .or(`model.ilike.%${query}%,make.ilike.%${query}%`)
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
  let orderQuery = supabase.from('orders').select('id, order_number, status')
  if (identifier.startsWith('ORD-') || identifier.startsWith('ord-')) {
    orderQuery = orderQuery.ilike('order_number', identifier)
  } else {
    orderQuery = orderQuery.eq('id', identifier)
  }

  const { data: order } = await orderQuery.single()
  if (!order) return JSON.stringify({ error: 'Order not found.' })

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
