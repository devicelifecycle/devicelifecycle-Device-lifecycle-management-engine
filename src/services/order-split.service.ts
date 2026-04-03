// ============================================================================
// ORDER SPLIT SERVICE
// Handles splitting a parent order into multiple sub-orders per vendor
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateOrderNumber } from '@/lib/utils'
import type {
  Order,
  OrderSplitConfig,
  OrderSplitAllocation,
} from '@/types'

export class OrderSplitService {
  /**
   * Check if an order can be split
   */
  static async canSplitOrder(orderId: string): Promise<{ canSplit: boolean; reason?: string }> {
    const supabase = await createServerSupabaseClient()

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, status, is_split_order, parent_order_id')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return { canSplit: false, reason: 'Order not found' }
    }

    if (order.parent_order_id) {
      return { canSplit: false, reason: 'Sub-orders cannot be split' }
    }

    if (order.is_split_order) {
      return { canSplit: false, reason: 'Order has already been split' }
    }

    if (order.status !== 'sourcing') {
      return { canSplit: false, reason: `Order must be in "sourcing" status (currently "${order.status}")` }
    }

    return { canSplit: true }
  }

  /**
   * Execute an order split across multiple vendors
   */
  static async executeOrderSplit(
    config: OrderSplitConfig,
    userId: string
  ): Promise<Order[]> {
    const supabase = await createServerSupabaseClient()
    const { parent_order_id, strategy, allocations } = config

    // 1. Validate the parent order
    const { canSplit, reason } = await this.canSplitOrder(parent_order_id)
    if (!canSplit) {
      throw new Error(reason || 'Cannot split this order')
    }

    // 2. Fetch parent order with items
    const { data: parentOrder, error: parentError } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', parent_order_id)
      .single()

    if (parentError || !parentOrder) {
      throw new Error('Failed to fetch parent order')
    }

    const parentItems = (parentOrder.items || []) as Array<{
      id: string
      order_id: string
      device_catalog_id: string
      quantity: number
      storage?: string
      color?: string
      condition?: string
      unit_price?: number
      total_price?: number
      notes?: string
    }>

    // 3. Validate allocations cover all items
    this.validateAllocations(parentItems, allocations)

    // 4. Check vendor uniqueness
    const vendorIds = allocations.map(a => a.vendor_id)
    if (new Set(vendorIds).size !== vendorIds.length) {
      throw new Error('Each vendor can only appear once in split allocations')
    }

    // 5. Mark parent as split
    const { error: updateParentError } = await supabase
      .from('orders')
      .update({
        is_split_order: true,
        split_strategy: strategy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parent_order_id)

    if (updateParentError) {
      throw new Error('Failed to update parent order')
    }

    // 6. Create sub-orders for each vendor allocation
    const subOrders: Order[] = []
    const suffixes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    for (let i = 0; i < allocations.length; i++) {
      const allocation = allocations[i]
      const suffix = suffixes[i] || String(i + 1)

      const subOrder = await this.createSubOrder(
        supabase,
        parentOrder,
        parentItems,
        allocation,
        suffix,
        userId
      )

      subOrders.push(subOrder)

      // 7. Record in audit table
      await supabase.from('order_splits').insert({
        parent_order_id,
        sub_order_id: subOrder.id,
        split_items: JSON.stringify(allocation.items),
        split_by_user_id: userId,
        split_at: new Date().toISOString(),
      })

      // 8. Update vendor bid if one exists for this vendor
      await supabase
        .from('vendor_bids')
        .update({
          quantity_allocated: allocation.items.reduce((sum, item) => sum + item.quantity, 0),
          sub_order_id: subOrder.id,
          is_finalized: true,
        })
        .eq('order_id', parent_order_id)
        .eq('vendor_id', allocation.vendor_id)
    }

    // 9. Transition parent to sourced
    await supabase
      .from('orders')
      .update({
        status: 'sourced',
        updated_at: new Date().toISOString(),
      })
      .eq('id', parent_order_id)

    // 10. Add timeline event
    await supabase.from('order_timeline').insert({
      order_id: parent_order_id,
      event: 'Order Split',
      description: `Order split into ${subOrders.length} sub-orders across ${allocations.length} vendors`,
      actor_id: userId,
      timestamp: new Date().toISOString(),
    })

    return subOrders
  }

  /**
   * Create a single sub-order from a vendor allocation
   */
  private static async createSubOrder(
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
    parentOrder: Record<string, any>,
    parentItems: Array<Record<string, any>>,
    allocation: OrderSplitAllocation,
    suffix: string,
    userId: string
  ): Promise<Order> {
    let totalQuantity = 0
    let totalAmount = 0

    for (const allocItem of allocation.items) {
      const parentItem = parentItems.find(pi => pi.id === allocItem.order_item_id)
      if (parentItem) {
        totalQuantity += allocItem.quantity
        totalAmount += (parentItem.unit_price || 0) * allocItem.quantity
      }
    }

    const subOrderNumber = `${parentOrder.order_number}-${suffix}`
    const { data: subOrder, error: subOrderError } = await supabase
      .from('orders')
      .insert({
        order_number: subOrderNumber,
        type: parentOrder.type,
        status: 'sourced',
        customer_id: parentOrder.customer_id,
        vendor_id: allocation.vendor_id,
        organization_id: parentOrder.organization_id,
        created_by_id: userId,
        parent_order_id: parentOrder.id,
        subtotal: totalAmount,
        tax: 0,
        shipping_cost: 0,
        total: totalAmount,
        notes: parentOrder.notes,
        internal_notes: `Sub-order ${suffix} of split order ${parentOrder.order_number}`,
      })
      .select()
      .single()

    if (subOrderError || !subOrder) {
      throw new Error(`Failed to create sub-order ${suffix}: ${subOrderError?.message}`)
    }

    const subItems = allocation.items
      .filter(allocItem => allocItem.quantity > 0)
      .map(allocItem => {
        const parentItem = parentItems.find(pi => pi.id === allocItem.order_item_id)
        if (!parentItem) throw new Error(`Parent item ${allocItem.order_item_id} not found`)
        return {
          order_id: subOrder.id,
          device_catalog_id: parentItem.device_catalog_id,
          quantity: allocItem.quantity,
          storage: parentItem.storage,
          color: parentItem.color,
          condition: parentItem.condition,
          unit_price: parentItem.unit_price || 0,
          total_price: (parentItem.unit_price || 0) * allocItem.quantity,
          notes: parentItem.notes,
          parent_item_id: parentItem.id,
          allocated_vendor_id: allocation.vendor_id,
        }
      })

    if (subItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(subItems)

      if (itemsError) {
        throw new Error(`Failed to create items for sub-order ${suffix}: ${itemsError.message}`)
      }
    }

    await supabase.from('order_timeline').insert({
      order_id: subOrder.id,
      event: 'Sub-order Created',
      description: `Created as part of split from order ${parentOrder.order_number}`,
      actor_id: userId,
      timestamp: new Date().toISOString(),
    })

    return subOrder as Order
  }

  /**
   * Validate that allocations cover all parent items exactly
   */
  private static validateAllocations(
    parentItems: Array<{ id: string; quantity: number }>,
    allocations: OrderSplitAllocation[]
  ): void {
    const allocatedQty: Record<string, number> = {}
    for (const alloc of allocations) {
      for (const item of alloc.items) {
        allocatedQty[item.order_item_id] = (allocatedQty[item.order_item_id] || 0) + item.quantity
      }
    }

    for (const parentItem of parentItems) {
      const allocated = allocatedQty[parentItem.id] || 0
      if (allocated !== parentItem.quantity) {
        throw new Error(
          `Item ${parentItem.id}: allocated ${allocated} but parent has ${parentItem.quantity}. ` +
          `Total allocation must match exactly.`
        )
      }
    }

    for (const itemId of Object.keys(allocatedQty)) {
      if (!parentItems.find(pi => pi.id === itemId)) {
        throw new Error(`Allocation references unknown item ${itemId}`)
      }
    }
  }

  /**
   * Get split status for an order (parent + all sub-orders)
   */
  static async getSplitStatus(orderId: string): Promise<{
    parent: Order
    sub_orders: Order[]
    splits: Array<{ sub_order_id: string; split_items: any; split_at: string }>
  }> {
    const supabase = await createServerSupabaseClient()

    const { data: parent, error: parentError } = await supabase
      .from('orders')
      .select('*, customer:customers(*), vendor:vendors(*), items:order_items(*, device:device_catalog(*))')
      .eq('id', orderId)
      .single()

    if (parentError || !parent) {
      throw new Error('Order not found')
    }

    const { data: subOrders, error: subError } = await supabase
      .from('orders')
      .select('*, vendor:vendors(*), items:order_items(*, device:device_catalog(*))')
      .eq('parent_order_id', orderId)
      .order('order_number', { ascending: true })

    if (subError) {
      throw new Error('Failed to fetch sub-orders')
    }

    const { data: splits } = await supabase
      .from('order_splits')
      .select('sub_order_id, split_items, split_at')
      .eq('parent_order_id', orderId)
      .order('split_at', { ascending: true })

    return {
      parent: parent as Order,
      sub_orders: (subOrders || []) as Order[],
      splits: splits || [],
    }
  }

  /**
   * Undo a split — only if no sub-order has progressed past 'sourced'
   */
  static async undoSplit(parentOrderId: string, userId: string): Promise<void> {
    const supabase = await createServerSupabaseClient()

    const { data: subOrders, error: subError } = await supabase
      .from('orders')
      .select('id, status, order_number')
      .eq('parent_order_id', parentOrderId)

    if (subError) {
      throw new Error('Failed to fetch sub-orders')
    }

    if (!subOrders || subOrders.length === 0) {
      throw new Error('No sub-orders found to undo')
    }

    const progressed = subOrders.filter(so => so.status !== 'sourced')
    if (progressed.length > 0) {
      throw new Error(
        `Cannot undo split: ${progressed.length} sub-order(s) have progressed past "sourced" status`
      )
    }

    for (const subOrder of subOrders) {
      await supabase.from('order_items').delete().eq('order_id', subOrder.id)
      await supabase.from('order_timeline').delete().eq('order_id', subOrder.id)
    }

    const subOrderIds = subOrders.map(so => so.id)
    await supabase.from('orders').delete().in('id', subOrderIds)

    await supabase.from('order_splits').delete().eq('parent_order_id', parentOrderId)

    await supabase
      .from('vendor_bids')
      .update({
        quantity_allocated: null,
        sub_order_id: null,
        is_finalized: false,
      })
      .eq('order_id', parentOrderId)

    await supabase
      .from('orders')
      .update({
        is_split_order: false,
        split_strategy: null,
        status: 'sourcing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', parentOrderId)

    await supabase.from('order_timeline').insert({
      order_id: parentOrderId,
      event: 'Split Undone',
      description: `Order split was reversed. ${subOrders.length} sub-orders removed.`,
      actor_id: userId,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Check if parent order should auto-transition based on sub-order states
   */
  static async checkParentAutoTransition(subOrderId: string): Promise<void> {
    const supabase = await createServerSupabaseClient()

    const { data: subOrder } = await supabase
      .from('orders')
      .select('parent_order_id')
      .eq('id', subOrderId)
      .single()

    if (!subOrder?.parent_order_id) return

    const { data: allSubOrders } = await supabase
      .from('orders')
      .select('status')
      .eq('parent_order_id', subOrder.parent_order_id)

    if (!allSubOrders || allSubOrders.length === 0) return

    const statuses = allSubOrders.map(so => so.status)

    let parentStatus: string | null = null

    if (statuses.every(s => s === 'closed')) {
      parentStatus = 'closed'
    } else if (statuses.every(s => s === 'delivered' || s === 'closed')) {
      parentStatus = 'delivered'
    } else if (statuses.every(s => s === 'shipped' || s === 'delivered' || s === 'closed')) {
      parentStatus = 'shipped'
    } else if (statuses.every(s => s === 'cancelled')) {
      parentStatus = 'cancelled'
    }

    if (parentStatus) {
      const updateData: Record<string, any> = {
        status: parentStatus,
        updated_at: new Date().toISOString(),
      }

      if (parentStatus === 'shipped') updateData.shipped_at = new Date().toISOString()
      if (parentStatus === 'delivered') updateData.received_at = new Date().toISOString()
      if (parentStatus === 'closed') updateData.completed_at = new Date().toISOString()
      if (parentStatus === 'cancelled') updateData.cancelled_at = new Date().toISOString()

      await supabase
        .from('orders')
        .update(updateData)
        .eq('id', subOrder.parent_order_id)
    }
  }

  /**
   * Cancel all sub-orders when parent is cancelled
   */
  static async cancelSubOrders(parentOrderId: string, userId: string): Promise<void> {
    const supabase = await createServerSupabaseClient()

    const { data: subOrders } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('parent_order_id', parentOrderId)
      .neq('status', 'cancelled')

    if (!subOrders || subOrders.length === 0) return

    for (const subOrder of subOrders) {
      await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', subOrder.id)

      await supabase.from('order_timeline').insert({
        order_id: subOrder.id,
        event: 'Cancelled',
        description: 'Cancelled due to parent order cancellation',
        actor_id: userId,
        timestamp: new Date().toISOString(),
      })
    }
  }
}
