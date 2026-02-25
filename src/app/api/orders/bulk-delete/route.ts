// ============================================================================
// BULK ORDER DELETE API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrderService } from '@/services/order.service'
import { AuditService } from '@/services/audit.service'

const MAX_BATCH_SIZE = 50

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admin can bulk delete
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    const body = await request.json()
    const { order_ids } = body

    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return NextResponse.json({ error: 'order_ids must be a non-empty array' }, { status: 400 })
    }
    if (order_ids.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `Maximum ${MAX_BATCH_SIZE} orders per batch` }, { status: 400 })
    }

    const results: { id: string; success: boolean; error?: string }[] = []

    for (const orderId of order_ids) {
      try {
        const order = await OrderService.getOrderById(orderId)
        if (!order) {
          results.push({ id: orderId, success: false, error: 'Not found' })
          continue
        }

        if (!['draft', 'cancelled'].includes(order.status)) {
          results.push({ id: orderId, success: false, error: `Cannot delete order in ${order.status} status` })
          continue
        }

        await OrderService.deleteOrder(orderId, user.id)

        await AuditService.logDelete(
          user.id, 'order', orderId,
          { order_number: order.order_number, bulk: true }
        )

        results.push({ id: orderId, success: true })
      } catch {
        results.push({ id: orderId, success: false, error: 'Internal error' })
      }
    }

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({ results, succeeded, failed })
  } catch (error) {
    console.error('Error in bulk delete:', error)
    return NextResponse.json({ error: 'Failed to process bulk delete' }, { status: 500 })
  }
}
