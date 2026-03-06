// ============================================================================
// ORDER SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VALID_ORDER_TRANSITIONS } from '@/lib/constants'
import { generateOrderNumber, sanitizeSearchInput } from '@/lib/utils'
import { OrderSplitService } from './order-split.service'
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

      const allowedVendorIds = (vendors || []).map((vendor) => vendor.id)
      if (allowedVendorIds.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          page_size,
          total_pages: 0,
        }
      }
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
      if (safeSearch) query = query.ilike('order_number', `%${safeSearch}%`)
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
    const supabase = createServerSupabaseClient()

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

    const { data, error } = await supabase
      .from('orders')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
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
   * Delete an order (soft delete or hard delete based on status)
   */
  static async deleteOrder(id: string, userId: string): Promise<void> {
    const supabase = createServerSupabaseClient()

    // Get current order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !order) {
      throw new Error('Order not found')
    }

    // Only allow deletion of draft or cancelled orders
    if (!['draft', 'cancelled'].includes(order.status)) {
      throw new Error('Only draft or cancelled orders can be deleted')
    }

    // Soft delete by setting status to cancelled and adding a deleted flag
    const { error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }

    // Log to audit
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
    const supabase = createServerSupabaseClient()

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
      case 'quoted':
        updateData.quoted_at = new Date().toISOString()
        break
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
    const supabase = createServerSupabaseClient()

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
    const supabase = createServerSupabaseClient()

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
