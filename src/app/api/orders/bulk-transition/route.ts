// ============================================================================
// BULK ORDER TRANSITION API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrderService } from '@/services/order.service'
import { AuditService } from '@/services/audit.service'
import { NotificationService } from '@/services/notification.service'
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { isValidUUID } from '@/lib/utils'
import type { OrderStatus } from '@/types'
export const dynamic = 'force-dynamic'


const MAX_BATCH_SIZE = 50

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(`bulk-transition:${getClientIp(request)}`, RATE_LIMITS.api)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only internal roles
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { order_ids, to_status, notes } = body

    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return NextResponse.json({ error: 'order_ids must be a non-empty array' }, { status: 400 })
    }
    if (order_ids.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `Maximum ${MAX_BATCH_SIZE} orders per batch` }, { status: 400 })
    }
    if (!to_status || typeof to_status !== 'string') {
      return NextResponse.json({ error: 'to_status is required' }, { status: 400 })
    }
    if (order_ids.some((id: unknown) => typeof id !== 'string' || !isValidUUID(id))) {
      return NextResponse.json({ error: 'All order_ids must be valid UUIDs' }, { status: 400 })
    }

    const results: { id: string; success: boolean; error?: string }[] = []

    for (const orderId of order_ids) {
      try {
        const currentOrder = await OrderService.getOrderById(orderId)
        if (!currentOrder) {
          results.push({ id: orderId, success: false, error: 'Not found' })
          continue
        }

        const canTransition = OrderService.isValidTransition(
          currentOrder.status as OrderStatus,
          to_status as OrderStatus
        )
        if (!canTransition) {
          results.push({ id: orderId, success: false, error: `Cannot transition from ${currentOrder.status} to ${to_status}` })
          continue
        }

        // Sourcing is CPO-only
        if (to_status === 'sourcing' && currentOrder.type !== 'cpo') {
          results.push({ id: orderId, success: false, error: 'Only CPO orders can be moved to sourcing' })
          continue
        }

        await OrderService.transitionOrder(orderId, to_status as OrderStatus, user.id, notes)

        await AuditService.logStatusChange(
          user.id, 'order', orderId,
          currentOrder.status, to_status,
          { notes, order_number: currentOrder.order_number, bulk: true }
        )

        // Fire-and-forget notifications
        NotificationService.sendOrderTransitionNotifications(
          {
            id: orderId,
            order_number: currentOrder.order_number,
            customer_id: currentOrder.customer_id,
            vendor_id: currentOrder.vendor_id,
            assigned_to_id: currentOrder.assigned_to_id,
            created_by_id: currentOrder.created_by_id,
          },
          currentOrder.status,
          to_status
        ).catch(err => console.error('Bulk notification error:', err))

        results.push({ id: orderId, success: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Internal error'
        results.push({ id: orderId, success: false, error: msg })
      }
    }

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({ results, succeeded, failed })
  } catch (error) {
    console.error('Error in bulk transition:', error)
    return NextResponse.json({ error: 'Failed to process bulk transition' }, { status: 500 })
  }
}
