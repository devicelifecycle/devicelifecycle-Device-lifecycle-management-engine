// ============================================================================
// ORDER ITEM INDIVIDUAL PATCH + DELETE
// PATCH — change device_id, quantity, storage, condition on a single item
// DELETE — remove a single item and recalculate order totals
// Only admin / coe_manager / coe_tech may modify items on an existing order.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const patchItemSchema = z.object({
  device_id: z.string().uuid('Invalid device_id').nullable().optional(),
  quantity: z.coerce.number().int().min(1).max(100000).optional(),
  storage: z.string().max(50).optional(),
  condition: z.enum(['new', 'excellent', 'good', 'fair', 'poor', 'broken']).optional(),
  notes: z.string().max(2000).optional(),
})

async function resolveParams(params: Promise<{ id: string; itemId: string }>) {
  return params
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, profile } = auth

    const allowed = ['admin', 'coe_manager', 'coe_tech', 'sales']
    if (!allowed.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: orderId, itemId } = await resolveParams(params)

    // Verify the item belongs to this order
    const { data: existingItem } = await supabase
      .from('order_items')
      .select('id, order_id, quantity')
      .eq('id', itemId)
      .eq('order_id', orderId)
      .single()

    if (!existingItem) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const body = await request.json()
    const parsed = patchItemSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message || 'Validation failed' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if ('device_id' in parsed.data) updates.device_id = parsed.data.device_id ?? null
    if (parsed.data.quantity !== undefined) updates.quantity = parsed.data.quantity
    if (parsed.data.storage !== undefined) updates.storage = parsed.data.storage
    if (parsed.data.condition !== undefined) updates.claimed_condition = parsed.data.condition
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes
    updates.updated_at = new Date().toISOString()

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('order_items')
      .update(updates)
      .eq('id', itemId)
      .eq('order_id', orderId)
      .select()
      .single()

    if (updateError) throw updateError

    // Recalculate order total_quantity
    const svc = createServiceRoleClient()
    const { data: allItems } = await svc.from('order_items').select('quantity').eq('order_id', orderId)
    const totalQuantity = (allItems || []).reduce((s, i) => s + (i.quantity || 0), 0)
    await svc.from('orders').update({ total_quantity: totalQuantity, updated_at: new Date().toISOString() }).eq('id', orderId)

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error patching order item:', error)
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, profile } = auth

    if (!['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: orderId, itemId } = await resolveParams(params)

    const { error: deleteError } = await supabase
      .from('order_items')
      .delete()
      .eq('id', itemId)
      .eq('order_id', orderId)

    if (deleteError) throw deleteError

    // Recalculate order total_quantity
    const svc = createServiceRoleClient()
    const { data: remaining } = await svc.from('order_items').select('quantity').eq('order_id', orderId)
    const totalQuantity = (remaining || []).reduce((s, i) => s + (i.quantity || 0), 0)
    await svc.from('orders').update({ total_quantity: totalQuantity, updated_at: new Date().toISOString() }).eq('id', orderId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting order item:', error)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}
