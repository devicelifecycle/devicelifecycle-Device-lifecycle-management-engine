import type { Order, OrderItem } from '@/types'

function sanitizeOrderItemForVendor(item: OrderItem): OrderItem {
  return {
    ...item,
    unit_price: undefined,
    quoted_price: undefined,
    final_price: undefined,
    notes: undefined,
    pricing_metadata: null,
    guaranteed_buyback_price: undefined,
    buyback_condition: undefined,
    buyback_valid_until: undefined,
  }
}

export function sanitizeOrderForVendor(order: Order): Order {
  return {
    ...order,
    customer_id: undefined,
    customer: undefined,
    total_amount: 0,
    quoted_amount: undefined,
    final_amount: undefined,
    notes: undefined,
    internal_notes: undefined,
    items: order.items?.map(sanitizeOrderItemForVendor),
    sub_orders: order.sub_orders?.map(sanitizeOrderForVendor),
  }
}

export function sanitizeOrdersForVendor(orders: Order[]): Order[] {
  return orders.map(sanitizeOrderForVendor)
}
