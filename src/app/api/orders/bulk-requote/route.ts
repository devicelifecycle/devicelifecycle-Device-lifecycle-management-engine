// ============================================================================
// BULK RE-QUOTE API ROUTE
// Recalculates pricing for every item on each selected order using the
// current adaptive pricing engine. Only orders in 'quoted' status are
// eligible. No customer notification is sent — matches the existing
// single-order reprice-mismatches behavior where notify is a separate,
// explicit admin action.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PricingService } from '@/services/pricing.service'
import { AuditService } from '@/services/audit.service'
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { bulkRequoteOrdersSchema } from '@/lib/validations'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'

function mapDeviceConditionToPricingCondition(condition?: string): 'new' | 'excellent' | 'good' | 'fair' | 'poor' {
  if (condition === 'new') return 'new'
  if (condition === 'excellent') return 'excellent'
  if (condition === 'fair') return 'fair'
  if (condition === 'broken' || condition === 'poor') return 'poor'
  return 'good'
}

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(`bulk-requote:${getClientIp(request)}`, RATE_LIMITS.api)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile } = auth

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Only administrators and CoE managers can bulk re-quote orders' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = bulkRequoteOrdersSchema.safeParse(body)
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0]
      return NextResponse.json({ error: firstError?.message || 'Validation failed' }, { status: 400 })
    }

    const { order_ids } = validationResult.data

    const { data: fetchedOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, type, total_amount, quoted_amount')
      .in('id', order_ids)

    type FetchedOrder = { id: string; order_number: string; status: string; type: string; total_amount: number | null; quoted_amount: number | null }
    const orderMap = new Map((fetchedOrders || []).map((o: FetchedOrder) => [o.id, o]))

    const results: { id: string; success: boolean; error?: string; old_amount?: number; new_amount?: number; items_repriced?: number }[] = []
    const eligible: FetchedOrder[] = []

    for (const orderId of order_ids) {
      const order = orderMap.get(orderId)
      if (!order) {
        results.push({ id: orderId, success: false, error: 'Not found' })
        continue
      }
      if (order.status !== 'quoted') {
        results.push({ id: orderId, success: false, error: `Only quoted orders can be re-quoted (current status: ${order.status})` })
        continue
      }
      eligible.push(order)
    }

    const pricingSupabase = createServiceRoleClient()

    await Promise.all(
      eligible.map(async (order) => {
        try {
          const { data: orderItems } = await supabase
            .from('order_items')
            .select('id, device_id, quantity, storage, claimed_condition, actual_condition, unit_price')
            .eq('order_id', order.id)

          if (!orderItems || orderItems.length === 0) {
            results.push({ id: order.id, success: false, error: 'No items on this order' })
            return
          }

          let itemsRepriced = 0
          for (const item of orderItems) {
            if (!item.device_id) continue
            const condition = mapDeviceConditionToPricingCondition(item.actual_condition || item.claimed_condition)
            const quantity = item.quantity || 1

            const calc = await PricingService.calculateAdaptivePrice({
              device_id: item.device_id,
              storage: item.storage || '128GB',
              carrier: 'Unlocked',
              condition,
              quantity,
            }, pricingSupabase)

            if (!calc.success || calc.trade_price == null) continue

            const unitPrice = Math.round((calc.trade_price / quantity) * 100) / 100
            await supabase
              .from('order_items')
              .update({
                unit_price: unitPrice,
                pricing_metadata: { pricing_source: 'system', requoted_at: new Date().toISOString(), previous_unit_price: item.unit_price },
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id)
              .eq('order_id', order.id)
            itemsRepriced += 1
          }

          const { data: updatedItems } = await supabase
            .from('order_items')
            .select('unit_price, quantity')
            .eq('order_id', order.id)

          const newAmount = updatedItems?.reduce((sum, i) => sum + ((i.unit_price || 0) * (i.quantity || 0)), 0) || 0
          const oldAmount = order.quoted_amount ?? order.total_amount ?? 0

          await supabase
            .from('orders')
            .update({ total_amount: newAmount, quoted_amount: newAmount, updated_at: new Date().toISOString() })
            .eq('id', order.id)

          await AuditService.log({
            user_id: authUser.id,
            action: 'price_change',
            entity_type: 'order',
            entity_id: order.id,
            old_values: { quoted_amount: oldAmount },
            new_values: { quoted_amount: newAmount },
            metadata: { event: 'bulk_requote', order_number: order.order_number, items_repriced: itemsRepriced },
          }).catch(() => {})

          results.push({ id: order.id, success: true, old_amount: oldAmount, new_amount: newAmount, items_repriced: itemsRepriced })
        } catch (error) {
          results.push({ id: order.id, success: false, error: safeErrorMessage(error, 'Failed to re-quote order') })
        }
      })
    )

    const succeeded = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    return NextResponse.json({ results, succeeded, failed })
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, 'Failed to process bulk re-quote') }, { status: 500 })
  }
}
