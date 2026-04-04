// ============================================================================
// POST-TRIAGE QUOTE GENERATION API
// POST /api/orders/:id/generate-quote
// For walk-in / unquoted trade-in orders that arrive at COE without a prior
// customer quote. After triage (qc_complete), COE managers can generate a
// quote priced on actual condition and send it to the customer.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PricingService } from '@/services/pricing.service'
import { OrderService } from '@/services/order.service'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['received', 'in_triage', 'qc_complete']

const normalizeStorage = (raw?: string): string => {
  const v = (raw || '').replace(/\s+/g, '').toUpperCase()
  if (!v || ['UNKNOWN', 'DEFAULT', 'N/A', 'NA'].includes(v)) return '128GB'
  if (v === '1024GB') return '1TB'
  if (v === '2048GB') return '2TB'
  if (v === '4096GB') return '4TB'
  return v
}

const mapCondition = (c?: string): 'new' | 'excellent' | 'good' | 'fair' | 'poor' => {
  const s = (c || '').toLowerCase()
  if (s === 'new') return 'new'
  if (s.includes('excellent')) return 'excellent'
  if (s === 'fair') return 'fair'
  if (['poor', 'broken'].some(x => s.includes(x))) return 'poor'
  return 'good'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Admin or COE manager required' }, { status: 403 })
    }

    const orderId = (await params).id

    // Load order
    const { data: order } = await supabase
      .from('orders')
      .select('id, type, status, quoted_amount, customer_id, customer:customers(default_risk_mode)')
      .eq('id', orderId)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.type !== 'trade_in') {
      return NextResponse.json({ error: 'Only trade-in orders support post-triage quotes' }, { status: 400 })
    }

    if (!VALID_STATUSES.includes(order.status)) {
      return NextResponse.json({
        error: `Order must be received/in_triage/qc_complete to generate a quote (currently: ${order.status})`,
      }, { status: 400 })
    }

    if ((order.quoted_amount ?? 0) > 0) {
      return NextResponse.json({ error: 'Order already has a quote' }, { status: 409 })
    }

    // Load order items
    const { data: items } = await supabase
      .from('order_items')
      .select('id, device_id, quantity, storage, claimed_condition, actual_condition')
      .eq('order_id', orderId)

    if (!items?.length) {
      return NextResponse.json({ error: 'Order has no line items' }, { status: 400 })
    }

    const riskMode =
      (order.customer as { default_risk_mode?: 'retail' | 'enterprise' } | null)?.default_risk_mode ?? 'retail'
    const pricingSupabase = createServiceRoleClient()

    // Price each item using actual_condition (post-triage) falling back to claimed_condition
    for (const item of items) {
      if (!item.device_id) continue

      const condition = mapCondition(item.actual_condition ?? item.claimed_condition)
      const storage = normalizeStorage(item.storage)
      const qty = Math.max(1, item.quantity || 1)

      try {
        const result = await PricingService.calculateAdaptivePrice(
          { device_id: item.device_id, storage, carrier: 'Unlocked', condition, quantity: qty, risk_mode: riskMode },
          pricingSupabase
        )
        if (!result.success || (result.trade_price ?? 0) <= 0) continue

        const unitPrice = result.trade_price! / qty

        await supabase
          .from('order_items')
          .update({
            unit_price: unitPrice,
            quoted_price: unitPrice,
            pricing_metadata: {
              suggested_by_calc: true,
              pricing_source: 'post_triage_auto',
              based_on: item.actual_condition ? 'actual_condition' : 'claimed_condition',
              condition_used: condition,
              confidence: result.confidence,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
      } catch {
        // Skip item on pricing error — do not abort the whole quote
      }
    }

    // Recalculate totals from updated items
    const { data: updatedItems } = await supabase
      .from('order_items')
      .select('unit_price, quantity')
      .eq('order_id', orderId)

    const totalAmount = (updatedItems ?? []).reduce(
      (sum, i) => sum + ((i.unit_price ?? 0) * (i.quantity ?? 1)),
      0
    )

    // If nothing got priced, abort
    if (totalAmount <= 0) {
      return NextResponse.json({ error: 'Could not calculate prices for any items — check device catalog and competitor data' }, { status: 422 })
    }

    await supabase
      .from('orders')
      .update({ total_amount: totalAmount, quoted_amount: totalAmount, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    // Transition order to 'quoted' so customer can accept/reject
    const updatedOrder = await OrderService.transitionOrder(
      orderId,
      'quoted',
      user.id,
      'Post-triage quote generated from actual device condition'
    )

    return NextResponse.json({ data: updatedOrder })
  } catch (error) {
    console.error('Error generating post-triage quote:', error)
    return NextResponse.json({ error: 'Failed to generate quote' }, { status: 500 })
  }
}
