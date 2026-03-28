// ============================================================================
// ORDER ITEMS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { bulkUpdateOrderItemPricesSchema, addOrderItemSchema } from '@/lib/validations'
import { safeErrorMessage, isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid order ID format' }, { status: 400 })
    }
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only internal roles can add order items
    const { data: itemProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (itemProfile && ['customer', 'vendor', 'coe_tech'].includes(itemProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = addOrderItemSchema.safeParse(body)
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0]
      const message = firstError?.message ?? 'Validation failed'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { device_id, quantity, storage, color, colour, condition, notes } = validationResult.data

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, customer:customers(organization_id)')
      .eq('id', params.id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const { data: userProfile } = await supabase.from('users').select('role, organization_id').eq('id', user.id).single()
    if (userProfile?.role === 'sales') {
      const cust = order.customer as { organization_id?: string } | null
      if (userProfile.organization_id && cust?.organization_id && cust.organization_id !== userProfile.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
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
        device_id: device_id || null,
        quantity,
        storage,
        colour: colour || color,
        claimed_condition: condition,
        notes,
      })
      .select()
      .single()

    if (error) {
      // FK violation = invalid device_id; return 400 with clear message
      if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('violates foreign key')) {
        return NextResponse.json(
          { error: device_id ? 'Device not found. Select a valid device from the catalog.' : 'Invalid reference.' },
          { status: 400 }
        )
      }
      throw error
    }

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

    const { data: order } = await supabase
      .from('orders')
      .select('id, type, customer:customers(organization_id)')
      .eq('id', params.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.type === 'cpo' && userProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can set CPO pricing' },
        { status: 403 }
      )
    }

    // Skip org check for admin and coe_manager — they can price any order
    const isInternalPricer = userProfile.role === 'admin' || userProfile.role === 'coe_manager'
    if (order && !isInternalPricer) {
      const { data: profile } = await supabase.from('users').select('organization_id').eq('id', user.id).single()
      if (profile?.organization_id) {
        const cust = order.customer as { organization_id?: string } | null
        if (cust?.organization_id && cust.organization_id !== profile.organization_id) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }

    const body = await request.json()

    // Validate input with Zod schema
    const validationResult = bulkUpdateOrderItemPricesSchema.safeParse(body)
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0]
      const message = firstError?.message || 'Validation failed'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { items } = validationResult.data

    if (order.type === 'cpo') {
      const hasSuggestedPricing = items.some(
        (item) => item.pricing_metadata?.suggested_by_calc === true
      )

      if (hasSuggestedPricing) {
        return NextResponse.json(
          { error: 'CPO pricing must be entered manually; suggested pricing is disabled for CPO orders' },
          { status: 400 }
        )
      }
    }

    const updateResults = await Promise.all(items.map(async (item) => {
      const meta = item.pricing_metadata ?? {}
      const mergedMeta = {
        ...(typeof meta === 'object' ? meta : {}),
        pricing_source: 'manual' as const,
      }
      const updatePayload: Record<string, unknown> = { unit_price: item.unit_price, pricing_metadata: mergedMeta }

      const { error } = await supabase
        .from('order_items')
        .update(updatePayload)
        .eq('id', item.id)
        .eq('order_id', params.id)

      if (error) {
        console.error(`Error updating item ${item.id}:`, error.message)
        // If pricing_metadata error, retry without it
        if (error.message.includes('pricing_metadata') || (error as { code?: string }).code === '42703') {
          const { error: retryError } = await supabase
            .from('order_items')
            .update({ unit_price: item.unit_price })
            .eq('id', item.id)
            .eq('order_id', params.id)
          if (retryError) return item.id
        } else {
          return item.id
        }
      }
      return null
    }))
    const errors = updateResults.filter((id): id is string => id !== null)

    if (errors.length > 0) {
      return NextResponse.json(
        { error: `Some items failed: ${errors.join('; ')}` },
        { status: 500 }
      )
    }

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
      { error: safeErrorMessage(error, 'Failed to update order item prices') },
      { status: 500 }
    )
  }
}
