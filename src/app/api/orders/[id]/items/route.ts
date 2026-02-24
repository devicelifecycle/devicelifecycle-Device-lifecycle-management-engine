// ============================================================================
// ORDER ITEMS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { bulkUpdateOrderItemPricesSchema } from '@/lib/validations'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { device_id, quantity, storage, color, condition, notes } = body

    if (!device_id || !quantity) {
      return NextResponse.json(
        { error: 'device_id and quantity are required' },
        { status: 400 }
      )
    }

    // Verify order exists
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('id', params.id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== 'draft') {
      return NextResponse.json(
        { error: 'Can only add items to draft orders' },
        { status: 400 }
      )
    }

    const { data: item, error } = await supabase
      .from('order_items')
      .insert({
        order_id: params.id,
        device_id,
        quantity,
        storage,
        color,
        claimed_condition: condition,
        notes,
      })
      .select()
      .single()

    if (error) throw error

    // Update order total quantity
    const { data: items } = await supabase
      .from('order_items')
      .select('quantity')
      .eq('order_id', params.id)

    const totalQuantity = items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0
    await supabase
      .from('orders')
      .update({ total_quantity: totalQuantity, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Error adding order item:', error)
    return NextResponse.json(
      { error: 'Failed to add order item' },
      { status: 500 }
    )
  }
}

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

    // Fetch current user's profile for authorization
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    // Only admin and coe_manager can set pricing
    if (userProfile.role !== 'admin' && userProfile.role !== 'coe_manager') {
      return NextResponse.json(
        { error: 'Only administrators and CoE managers can set pricing' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Validate input with Zod schema
    const validationResult = bulkUpdateOrderItemPricesSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { items } = validationResult.data

    // Update each item's price
    const updates = items.map(async (item) => {
      const { error } = await supabase
        .from('order_items')
        .update({
          unit_price: item.unit_price,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id)
        .eq('order_id', params.id) // Ensure item belongs to this order

      if (error) throw error
    })

    await Promise.all(updates)

    // Calculate and update order total
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('unit_price, quantity')
      .eq('order_id', params.id)

    const totalAmount = orderItems?.reduce(
      (sum, item) => sum + ((item.unit_price || 0) * (item.quantity || 0)),
      0
    ) || 0

    await supabase
      .from('orders')
      .update({
        total_amount: totalAmount,
        quoted_amount: totalAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)

    return NextResponse.json({ success: true, total_amount: totalAmount })
  } catch (error) {
    console.error('Error updating order item prices:', error)
    return NextResponse.json(
      { error: 'Failed to update order item prices' },
      { status: 500 }
    )
  }
}
