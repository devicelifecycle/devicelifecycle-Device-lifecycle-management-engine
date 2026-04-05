// ============================================================================
// NOTIFY QUOTE UPDATES API
// POST /api/pricing/notify-quote-updates
// After pricing settings change, re-calculate prices for all active quoted orders
// and notify customers whose quoted amounts have changed materially (>$1).
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PricingService } from '@/services/pricing.service'
import { NotificationService } from '@/services/notification.service'



export const dynamic = 'force-dynamic'

const CHANGE_THRESHOLD = 1 // dollars — only notify if quoted price changed by > $1

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const svc = createServiceRoleClient()

    // Find orders that are currently quoted (awaiting customer acceptance)
    const { data: orders } = await svc
      .from('orders')
      .select(`
        id, order_number, quoted_amount, type, customer_id,
        order_items(id, device_id, quantity, claimed_condition, quoted_price, storage)
      `)
      .in('status', ['quoted', 'submitted'])
      .not('quoted_amount', 'is', null)

    if (!orders || orders.length === 0) {
      return NextResponse.json({ notified: 0, orders_checked: 0 })
    }

    let notified = 0

    for (const order of orders) {
      const items = (order.order_items as Array<{
        id: string; device_id: string | null; quantity: number
        claimed_condition: string | null; quoted_price: number | null; storage: string | null
      }>) || []

      if (!order.customer_id || items.length === 0) continue

      // Re-calculate engine price for each item
      let newTotal = 0
      let hasChanged = false

      for (const item of items) {
        if (!item.device_id || item.quoted_price == null) continue
        try {
          const result = await PricingService.calculatePriceV2({
            device_id: item.device_id,
            storage: item.storage || '128GB',
            condition: (item.claimed_condition as 'new' | 'excellent' | 'good' | 'fair' | 'poor') || 'good',
            quantity: item.quantity,
          })
          const newUnitPrice = result.trade_price ?? item.quoted_price
          newTotal += newUnitPrice * item.quantity
          if (Math.abs(newUnitPrice - item.quoted_price) > CHANGE_THRESHOLD) {
            hasChanged = true
          }
        } catch {
          newTotal += (item.quoted_price ?? 0) * item.quantity
        }
      }

      if (!hasChanged) continue

      // Find the customer's org users to notify
      const { data: customer } = await svc
        .from('customers')
        .select('organization_id')
        .eq('id', order.customer_id)
        .single()

      if (!customer?.organization_id) continue

      const { data: orgUsers } = await svc
        .from('users')
        .select('id')
        .eq('organization_id', customer.organization_id)
        .eq('role', 'customer')
        .eq('is_active', true)

      if (!orgUsers || orgUsers.length === 0) continue

      const diff = newTotal - (order.quoted_amount ?? 0)
      const direction = diff > 0 ? 'increased' : 'decreased'
      const absDiff = Math.abs(diff)

      for (const orgUser of orgUsers) {
        await NotificationService.createNotification({
          user_id: orgUser.id,
          type: 'in_app',
          title: `Updated Quote — Order #${order.order_number}`,
          message: `Your quote for Order #${order.order_number} has ${direction} by $${absDiff.toFixed(2)} following a pricing update. Please review your order.`,
          link: `/orders/${order.id}`,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            event: 'quote_updated',
            old_amount: order.quoted_amount,
            new_amount: newTotal,
          },
        }).catch(() => {})
      }

      notified++
    }

    return NextResponse.json({ notified, orders_checked: orders.length })
  } catch (error) {
    console.error('notify-quote-updates error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
