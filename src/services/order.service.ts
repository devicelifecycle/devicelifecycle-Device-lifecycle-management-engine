// ============================================================================
// ORDER SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { VALID_ORDER_TRANSITIONS } from '@/lib/constants'
import { generateOrderNumber, sanitizeSearchInput } from '@/lib/utils'
import { OrderSplitService } from './order-split.service'
import { PricingService } from './pricing.service'
import type {
  Order,
  OrderStatus,
  OrderType,
  OrderFilters,
  CreateOrderInput,
  UpdateOrderInput,
  PaginatedResponse,
} from '@/types'

export class OrderService {
  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  /**
   * Get orders with filters and pagination
   */
  static async getOrders(filters: OrderFilters): Promise<PaginatedResponse<Order>> {
    const supabase = createServerSupabaseClient()
    
    const {
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'desc',
      status,
      type,
      customer_id,
      vendor_id,
      assigned_to_id,
      date_from,
      date_to,
      search,
      is_sla_breached,
      requester_id,
      requester_role,
      requester_organization_id,
    } = filters

    let query = supabase
      .from('orders')
      .select('*, customer:customers(*), vendor:vendors(*)', { count: 'exact' })

    if (requester_role === 'sales' && requester_id) {
      query = query.or(`created_by_id.eq.${requester_id},assigned_to_id.eq.${requester_id}`)
    }

    if (requester_role === 'customer' && requester_organization_id) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', requester_organization_id)

      const allowedCustomerIds = (customers || []).map((customer) => customer.id)
      if (allowedCustomerIds.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          page_size,
          total_pages: 0,
        }
      }
      query = query.in('customer_id', allowedCustomerIds)
    }

    if (requester_role === 'vendor' && requester_organization_id) {
      const { data: vendors } = await supabase
        .from('vendors')
        .select('id')
        .eq('organization_id', requester_organization_id)

      const allowedVendorIds = (vendors || []).map((v) => v.id)
      if (allowedVendorIds.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          page_size,
          total_pages: 0,
        }
      }
      // Vendors see all orders assigned to them: directly assigned OR sub-orders from split
      query = query.in('vendor_id', allowedVendorIds)
    }

    // Apply filters
    if (status) {
      if (Array.isArray(status)) {
        query = query.in('status', status)
      } else {
        query = query.eq('status', status)
      }
    }

    if (type) {
      query = query.eq('type', type)
    }

    if (customer_id) {
      query = query.eq('customer_id', customer_id)
    }

    if (vendor_id) {
      query = query.eq('vendor_id', vendor_id)
    }

    if (assigned_to_id) {
      query = query.eq('assigned_to_id', assigned_to_id)
    }

    if (date_from) {
      query = query.gte('created_at', date_from)
    }

    if (date_to) {
      query = query.lte('created_at', date_to)
    }

    if (search) {
      const safeSearch = sanitizeSearchInput(search)
      if (safeSearch) {
        // Also check order_items for matching IMEI or serial_number
        const { data: matchingItems } = await supabase
          .from('order_items')
          .select('order_id')
          .or(`imei.ilike.%${safeSearch}%,serial_number.ilike.%${safeSearch}%`)
          .limit(200)

        const matchingOrderIds = [
          ...new Set((matchingItems || []).map((i: { order_id: string }) => i.order_id).filter(Boolean)),
        ]

        if (matchingOrderIds.length > 0) {
          // Match on order number OR on orders that contain a device with that IMEI/serial
          query = query.or(`order_number.ilike.%${safeSearch}%,id.in.(${matchingOrderIds.join(',')})`)
        } else {
          query = query.ilike('order_number', `%${safeSearch}%`)
        }
      }
    }

    if (is_sla_breached !== undefined) {
      query = query.eq('is_sla_breached', is_sla_breached)
    }

    // Apply sorting (allowlist to prevent injection)
    const ALLOWED_SORT_COLUMNS = ['created_at', 'updated_at', 'order_number', 'status', 'total_amount', 'quoted_amount'] as const
    const safeSortBy = ALLOWED_SORT_COLUMNS.includes(sort_by as (typeof ALLOWED_SORT_COLUMNS)[number]) ? sort_by : 'created_at'
    const safeSortOrder = sort_order === 'asc' ? 'asc' : 'desc'
    query = query.order(safeSortBy, { ascending: safeSortOrder === 'asc' })

    // Apply pagination
    const from = (page - 1) * page_size
    const to = from + page_size - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      throw new Error(error.message)
    }

    return {
      data: data as Order[],
      total: count || 0,
      page,
      page_size,
      total_pages: Math.ceil((count || 0) / page_size),
    }
  }

  /**
   * Get a single order by ID
   */
  static async getOrderById(id: string): Promise<Order | null> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customers(*),
        vendor:vendors(*),
        items:order_items(*, device:device_catalog(*)),
        shipments(*),
        timeline:order_timeline(*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }

    const order = data as Order

    // If this is a split parent, fetch sub-orders
    if (order.is_split_order) {
      const { data: subOrders } = await supabase
        .from('orders')
        .select('*, vendor:vendors(*), items:order_items(*, device:device_catalog(*))')
        .eq('parent_order_id', id)
        .order('order_number', { ascending: true })

      order.sub_orders = (subOrders || []) as Order[]
    }

    // If this is a sub-order, fetch parent reference
    if (order.parent_order_id) {
      const { data: parentOrder } = await supabase
        .from('orders')
        .select('id, order_number, status, is_split_order')
        .eq('id', order.parent_order_id)
        .single()

      if (parentOrder) {
        order.parent_order = parentOrder as Order
      }
    }

    return order
  }

  /**
   * Create a new order
   */
  static async createOrder(input: CreateOrderInput, userId: string, orgId: string): Promise<Order> {
    // Use service role to bypass RLS - API has already validated permissions
    const supabase = createServiceRoleClient()

    const orderNumber = generateOrderNumber()

    // Create the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        type: input.type,
        status: 'draft',
        customer_id: input.customer_id,
        created_by_id: userId,
        notes: input.customer_notes,
        internal_notes: input.internal_notes,
      })
      .select()
      .single()

    if (orderError) {
      throw new Error(orderError.message)
    }

    // Create order items
    if (input.items && input.items.length > 0) {
      const items = input.items.map(item => ({
        order_id: order.id,
        device_id: item.device_id || item.device_catalog_id,
        quantity: item.quantity,
        storage: item.storage,
        colour: item.color,
        claimed_condition: item.condition,
        unit_price: 0,
        notes: item.notes,
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(items)

      if (itemsError) {
        throw new Error(itemsError.message)
      }

      const totalQty = input.items.reduce((sum, i) => sum + (i.quantity || 1), 0)
      await supabase
        .from('orders')
        .update({ total_quantity: totalQty })
        .eq('id', order.id)
    }

    // Create timeline event
    await this.addTimelineEvent(order.id, 'Order Created', `Order ${orderNumber} created`, userId)

    // Log to audit
    await this.logAudit(userId, 'create', 'order', order.id, null, order)

    return order as Order
  }

  /**
   * Update an order
   */
  static async updateOrder(id: string, input: UpdateOrderInput, userId: string): Promise<Order> {
    const supabase = createServerSupabaseClient()

    // Get current order for audit log
    const { data: currentOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()

    // Map API field customer_notes -> DB column notes (orders table has notes, not customer_notes)
    const { customer_notes, ...rest } = input
    const dbPayload: Record<string, unknown> = {
      ...rest,
      updated_at: new Date().toISOString(),
    }
    if (customer_notes !== undefined) dbPayload.notes = customer_notes

    const { data, error } = await supabase
      .from('orders')
      .update(dbPayload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    // Log to audit
    await this.logAudit(userId, 'update', 'order', id, currentOrder, data)

    return data as Order
  }

  // ============================================================================
  // STATE MACHINE
  // ============================================================================

  /**
   * Delete an order. Soft-deletes by setting status to cancelled (hard delete
   * would require cascading order_timeline, shipments, etc.).
   */
  static async deleteOrder(id: string, userId: string): Promise<void> {
    const supabase = createServerSupabaseClient()

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !order) {
      throw new Error('Order not found')
    }

    if (!['draft', 'cancelled'].includes(order.status)) {
      throw new Error('Only draft or cancelled orders can be deleted')
    }

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }

    await this.logAudit(userId, 'delete', 'order', id, order, null)
  }

  /**
   * Check if a transition is valid for an order
   */
  static async canTransition(id: string, toStatus: OrderStatus): Promise<boolean> {
    const supabase = createServerSupabaseClient()

    const { data: order, error } = await supabase
      .from('orders')
      .select('status')
      .eq('id', id)
      .single()

    if (error || !order) {
      return false
    }

    return this.isValidTransition(order.status as OrderStatus, toStatus)
  }

  /**
   * Transition order to a new status
   */
  static async transitionOrder(
    id: string,
    toStatus: OrderStatus,
    userId: string,
    notes?: string
  ): Promise<Order> {
    // Use service role to bypass RLS — the API route has already validated permissions
    // (customers are allowed to accept/reject quotes but RLS only grants UPDATE to internal users)
    const supabase = createServiceRoleClient()

    // Get current order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !order) {
      throw new Error('Order not found')
    }

    // Validate transition
    const validTransitions = VALID_ORDER_TRANSITIONS[order.status as OrderStatus] || []
    if (!validTransitions.includes(toStatus)) {
      throw new Error(`Invalid transition from ${order.status} to ${toStatus}`)
    }

    // Prepare update data
    const updateData: Record<string, any> = {
      status: toStatus,
      updated_at: new Date().toISOString(),
    }

    // Set status-specific timestamps
    switch (toStatus) {
      case 'submitted':
        updateData.submitted_at = new Date().toISOString()
        break
      case 'quoted': {
        const now = new Date()
        updateData.quoted_at = now.toISOString()
        // Trade-in quotes valid for 30 days
        const expiryDays = 30
        updateData.quote_expires_at = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
        break
      }
      case 'accepted':
        updateData.accepted_at = new Date().toISOString()
        break
      case 'shipped':
        updateData.shipped_at = new Date().toISOString()
        break
      case 'received':
        updateData.received_at = new Date().toISOString()
        break
      case 'closed':
        updateData.completed_at = new Date().toISOString()
        break
      case 'cancelled':
        updateData.cancelled_at = new Date().toISOString()
        break
    }

    // Update order
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      throw new Error(updateError.message)
    }

    // Auto-create quote when order is submitted (trade_in only): run pricing for all items
    if (toStatus === 'submitted' && order.type === 'trade_in') {
      try {
        await this.autoQuoteOrderItems(id)
      } catch (err) {
        console.error('[OrderService] Auto-quote failed:', err)
      }
    }

    // Populate sales_history when order closes (for pricing model training)
    if (toStatus === 'closed') {
      await this.recordSalesHistory(supabase, id, order.type as 'trade_in' | 'cpo')
    }

    // Add timeline event
    await this.addTimelineEvent(
      id,
      'Status Changed',
      `Status changed from ${order.status} to ${toStatus}${notes ? `: ${notes}` : ''}`,
      userId
    )

    // Log to audit
    await this.logAudit(userId, 'status_change', 'order', id, order, updatedOrder)

    // Split order handling:
    // If cancelling a split parent → cascade cancel to all sub-orders
    if (toStatus === 'cancelled' && order.is_split_order) {
      await OrderSplitService.cancelSubOrders(id, userId)
    }
    // If transitioning a sub-order → check if parent should auto-transition
    if (order.parent_order_id) {
      await OrderSplitService.checkParentAutoTransition(id)
    }

    return updatedOrder as Order
  }

  /**
   * Auto-generate quote (prices) for all order items when order is submitted.
   * Runs pricing calculation for each trade_in item and updates order_items.
   */
  static async autoQuoteOrderItems(orderId: string): Promise<void> {
    const supabase = createServerSupabaseClient()

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, type, customer_id, customer:customers(default_risk_mode)')
      .eq('id', orderId)
      .single()

    if (orderErr || !order || order.type !== 'trade_in') return

    const { data: items } = await supabase
      .from('order_items')
      .select('id, device_id, quantity, storage, claimed_condition')
      .eq('order_id', orderId)

    if (!items?.length) return

    const riskMode = (order.customer as { default_risk_mode?: 'retail' | 'enterprise' } | null)?.default_risk_mode || 'retail'
    const STORAGE_OPTIONS = ['128GB', '256GB', '512GB', '1TB']
    const mapCondition = (c?: string): 'new' | 'excellent' | 'good' | 'fair' | 'poor' => {
      if (!c) return 'good'
      const s = String(c).toLowerCase()
      if (s === 'new') return 'new'
      if (['excellent', 'excellant'].some(x => s.includes(x))) return 'excellent'
      if (s === 'good') return 'good'
      if (s === 'fair') return 'fair'
      if (['poor', 'broken'].some(x => s.includes(x))) return 'poor'
      return 'good'
    }

    for (const item of items) {
      if (!item.device_id) continue
      const storage = (item.storage || '128GB').replace(/\s+/g, '').toUpperCase()
      const condition = mapCondition(item.claimed_condition)
      const qty = Math.max(1, item.quantity || 1)

      try {
        const result = await PricingService.calculatePriceV2({
          device_id: item.device_id,
          storage: STORAGE_OPTIONS.includes(storage) ? storage : '128GB',
          carrier: 'Unlocked',
          condition,
          quantity: qty,
          risk_mode: riskMode,
        })
        if (!result.success || result.trade_price == null || result.trade_price <= 0) continue

        const unitPrice = result.trade_price / qty
        const metadata = {
          suggested_by_calc: true,
          pricing_source: 'auto' as const,
          confidence: result.confidence,
          margin_tier: result.channel_decision?.margin_tier,
          anchor_price: result.breakdown?.anchor_price,
        }

        await supabase
          .from('order_items')
          .update({
            unit_price: unitPrice,
            quoted_price: unitPrice,
            pricing_metadata: metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
          .eq('order_id', orderId)
      } catch {
        // Skip item on error
      }
    }

    // Recalculate order totals
    const { data: updatedItems } = await supabase
      .from('order_items')
      .select('unit_price, quantity')
      .eq('order_id', orderId)

    const totalAmount = (updatedItems || []).reduce(
      (sum, i) => sum + ((i.unit_price ?? 0) * (i.quantity ?? 1)),
      0
    )

    await supabase
      .from('orders')
      .update({
        total_amount: totalAmount,
        quoted_amount: totalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
  }

  /**
   * Check if a transition is valid
   */
  static isValidTransition(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
    const validTransitions = VALID_ORDER_TRANSITIONS[fromStatus] || []
    return validTransitions.includes(toStatus)
  }

  /**
   * Get valid next statuses for an order
   */
  static getValidNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
    return VALID_ORDER_TRANSITIONS[currentStatus] || []
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Record order items to sales_history when order closes.
   * Feeds our data-driven pricing model training.
   */
  private static async recordSalesHistory(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    orderId: string,
    transactionType: 'trade_in' | 'cpo'
  ): Promise<void> {
    const { data: items } = await supabase
      .from('order_items')
      .select('device_id, storage, actual_condition, claimed_condition, final_price, quoted_price, quantity')
      .eq('order_id', orderId)

    if (!items?.length) return

    const rows = items
      .filter(it => {
        const price = it.final_price ?? it.quoted_price
        return it.device_id && price != null && Number(price) > 0
      })
      .flatMap(it => {
        const price = Number(it.final_price ?? it.quoted_price)
        const condition = (it.actual_condition ?? it.claimed_condition ?? 'good') as string
        const qty = it.quantity ?? 1
        return Array.from({ length: qty }, () => ({
          device_id: it.device_id,
          storage: it.storage ?? '128GB',
          carrier: 'Unlocked',
          condition,
          sold_price: price / qty,
          order_id: orderId,
          transaction_type: transactionType === 'trade_in' ? 'buy' : 'sell',
        }))
      })

    if (rows.length > 0) {
      await supabase.from('sales_history').insert(rows)
    }
  }

  /**
   * Add a timeline event to an order
   */
  private static async addTimelineEvent(
    orderId: string,
    event: string,
    description: string,
    actorId: string
  ) {
    const supabase = createServiceRoleClient()

    // Get actor name
    const { data: user } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', actorId)
      .single()

    await supabase.from('order_timeline').insert({
      order_id: orderId,
      event,
      description,
      actor_id: actorId,
      actor_name: user?.full_name || 'System',
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Log to audit trail
   */
  private static async logAudit(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    oldValues: any,
    newValues: any
  ) {
    const supabase = createServiceRoleClient()

    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues,
      new_values: newValues,
    })
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get order statistics for dashboard
   */
  static async getOrderStats(orgId?: string) {
    const supabase = createServerSupabaseClient()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const monthAgo = new Date(today)
    monthAgo.setMonth(monthAgo.getMonth() - 1)

    // Get counts
    const [todayCount, weekCount, monthCount, pendingCount, breachedCount] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString()),
      supabase.from('orders').select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString()),
      supabase.from('orders').select('*', { count: 'exact', head: true })
        .gte('created_at', monthAgo.toISOString()),
      supabase.from('orders').select('*', { count: 'exact', head: true })
        .in('status', ['draft', 'submitted', 'quoted']),
      supabase.from('orders').select('*', { count: 'exact', head: true })
        .eq('is_sla_breached', true)
        .not('status', 'in', '(closed,cancelled)'),
    ])

    return {
      orders_today: todayCount.count || 0,
      orders_this_week: weekCount.count || 0,
      orders_this_month: monthCount.count || 0,
      pending_quotes: pendingCount.count || 0,
      sla_breaches: breachedCount.count || 0,
    }
  }
}
