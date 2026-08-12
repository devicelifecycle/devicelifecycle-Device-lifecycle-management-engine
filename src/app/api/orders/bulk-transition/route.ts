// ============================================================================
// BULK ORDER TRANSITION API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { OrderService } from '@/services/order.service'
import { AuditService } from '@/services/audit.service'
import { NotificationService } from '@/services/notification.service'
import { checkRateLimitAsync, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { isValidUUID } from '@/lib/utils'
import type { OrderStatus } from '@/types'
export const dynamic = 'force-dynamic'


const MAX_BATCH_SIZE = 50

export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimitAsync(`bulk-transition:${getClientIp(request)}`, RATE_LIMITS.api)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!['admin', 'coe_manager', 'coe_tech', 'sales'].includes(effectiveRole)) {
      return NextResponse.json({ error: 'Forbidden — internal role required' }, { status: 403 })
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

    // Per-status role restrictions — must mirror src/app/api/orders/[id]/transition/route.ts
    if (to_status === 'quoted' && !['admin', 'coe_manager', 'sales'].includes(effectiveRole)) {
      return NextResponse.json({ error: 'Only admin, COE managers, or sales can send quotes' }, { status: 403 })
    }
    if (to_status === 'mismatch_review' && !['admin', 'coe_manager'].includes(effectiveRole)) {
      return NextResponse.json({ error: 'Only admin or COE managers can flag a mismatch review' }, { status: 403 })
    }
    if (to_status === 'payment_processing' && !['admin', 'coe_manager', 'sales'].includes(effectiveRole)) {
      return NextResponse.json({ error: 'Only admin, COE managers, or sales can initiate payment processing' }, { status: 403 })
    }
    if (to_status === 'payment_sent' && !['admin', 'coe_manager'].includes(effectiveRole)) {
      return NextResponse.json({ error: 'Only admin or COE managers can mark payment as sent' }, { status: 403 })
    }
    if (order_ids.some((id: unknown) => typeof id !== 'string' || !isValidUUID(id))) {
      return NextResponse.json({ error: 'All order_ids must be valid UUIDs' }, { status: 400 })
    }

    // Batch-fetch all orders in one query instead of N sequential getOrderById calls
    const { data: fetchedOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, type, customer_id, vendor_id, assigned_to_id, created_by_id')
      .in('id', order_ids)

    type FetchedOrder = { id: string; order_number: string; status: string; type: string; customer_id: string | null; vendor_id: string | null; assigned_to_id: string | null; created_by_id: string | null }
    const orderMap = new Map((fetchedOrders || []).map((o: FetchedOrder) => [o.id, o]))

    // Validate each order, then run transitions in parallel
    type TransitionItem = { orderId: string; currentOrder: FetchedOrder }
    const toTransition: TransitionItem[] = []
    const results: { id: string; success: boolean; error?: string }[] = []

    for (const orderId of order_ids) {
      const currentOrder = orderMap.get(orderId)
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
      if (to_status === 'sourcing' && currentOrder.type !== 'cpo') {
        results.push({ id: orderId, success: false, error: 'Only CPO orders can be moved to sourcing' })
        continue
      }
      toTransition.push({ orderId, currentOrder })
    }

    // Run all valid transitions in parallel
    const transitionResults = await Promise.allSettled(
      toTransition.map(async ({ orderId, currentOrder }) => {
        await OrderService.transitionOrder(orderId, to_status as OrderStatus, authUser.id, notes)
        AuditService.logStatusChange(
          authUser.id, 'order', orderId,
          currentOrder.status, to_status,
          { notes, order_number: currentOrder.order_number, bulk: true }
        ).catch(() => {})
        NotificationService.sendOrderTransitionNotifications(
          {
            id: orderId,
            order_number: currentOrder.order_number,
            customer_id: currentOrder.customer_id ?? undefined,
            vendor_id: currentOrder.vendor_id ?? undefined,
            assigned_to_id: currentOrder.assigned_to_id ?? undefined,
            created_by_id: currentOrder.created_by_id ?? '',
          },
          currentOrder.status,
          to_status
        ).catch(err => console.error('Bulk notification error:', err))
        return orderId
      })
    )

    for (let i = 0; i < toTransition.length; i++) {
      const { orderId } = toTransition[i]
      const settled = transitionResults[i]
      if (settled.status === 'fulfilled') {
        results.push({ id: orderId, success: true })
      } else {
        const msg = settled.reason instanceof Error ? settled.reason.message : 'Internal error'
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
