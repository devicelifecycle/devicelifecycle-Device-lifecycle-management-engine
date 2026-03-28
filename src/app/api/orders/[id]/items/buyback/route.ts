// ============================================================================
// ORDER ITEMS BUYBACK API
// PATCH: Update guaranteed buyback price, condition, valid-until for CPO items
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { bulkUpdateOrderItemBuybackSchema } from '@/lib/validations'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userProfile || !['admin', 'coe_manager'].includes(userProfile.role)) {
      return NextResponse.json(
        { error: 'Only administrators and CoE managers can set buyback guarantee' },
        { status: 403 }
      )
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, type')
      .eq('id', params.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.type !== 'cpo') {
      return NextResponse.json(
        { error: 'Buyback guarantee only applies to CPO orders' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const validationResult = bulkUpdateOrderItemBuybackSchema.safeParse(body)
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0]
      const message = firstError?.message || 'Validation failed'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { items } = validationResult.data

    for (const item of items) {
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (item.guaranteed_buyback_price !== undefined) {
        updatePayload.guaranteed_buyback_price = item.guaranteed_buyback_price
      }
      if (item.buyback_condition !== undefined) {
        updatePayload.buyback_condition = item.buyback_condition
      }
      if (item.buyback_valid_until !== undefined) {
        const val = item.buyback_valid_until
        updatePayload.buyback_valid_until = val && typeof val === 'string' && val.trim() ? val.trim() : null
      }

      const hasBuybackFields = 'guaranteed_buyback_price' in updatePayload ||
        'buyback_condition' in updatePayload ||
        'buyback_valid_until' in updatePayload
      if (!hasBuybackFields) continue

      const { error } = await supabase
        .from('order_items')
        .update(updatePayload)
        .eq('id', item.id)
        .eq('order_id', params.id)

      if (error) {
        console.error(`Error updating buyback for item ${item.id}:`, error.message)
        return NextResponse.json(
          { error: `Failed to update item ${item.id}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating order item buyback:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to update buyback guarantee') },
      { status: 500 }
    )
  }
}
