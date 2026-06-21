// ============================================================================
// CUSTOMER ORDER ANALYTICS — monthly + all-time, scoped to this customer
// Same shape as get_order_analytics() (src/app/api/analytics/orders/route.ts)
// but filtered to this customer's own orders, computed in JS since the
// SQL RPC aggregates platform-wide and isn't parameterized by customer_id.
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ensureCustomerProfileForOrganization } from '@/lib/customer-profile'

export const dynamic = 'force-dynamic'

const EMPTY = { monthly: [] as { month: string; order_count: number; total_value: number }[], all_time: { total_orders: 0, total_value: 0 } }

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (effectiveRole !== 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!profile.organization_id) {
      return NextResponse.json(EMPTY)
    }

    const serviceRole = createServiceRoleClient()
    const { data: userDetails } = await supabase
      .from('users')
      .select('full_name, email, notification_email, phone')
      .eq('id', authUser.id)
      .single()

    let customerId: string | null = null
    try {
      const customer = await ensureCustomerProfileForOrganization(serviceRole, profile.organization_id, userDetails ?? {})
      customerId = customer.id
    } catch {
      return NextResponse.json(EMPTY)
    }

    const { data: orders, error } = await serviceRole
      .from('orders')
      .select('created_at, total_amount, status')
      .eq('customer_id', customerId)
      .neq('status', 'cancelled')

    if (error) throw error

    const byMonth = new Map<string, { order_count: number; total_value: number }>()
    let totalValue = 0
    for (const order of orders || []) {
      const month = new Date(order.created_at).toLocaleDateString('en-CA', {
        year: 'numeric', month: '2-digit', timeZone: 'America/Toronto',
      }).slice(0, 7) // "YYYY-MM"
      const entry = byMonth.get(month) || { order_count: 0, total_value: 0 }
      entry.order_count += 1
      entry.total_value += order.total_amount || 0
      byMonth.set(month, entry)
      totalValue += order.total_amount || 0
    }

    const monthly = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, order_count: v.order_count, total_value: Math.round(v.total_value * 100) / 100 }))

    return NextResponse.json({
      monthly,
      all_time: { total_orders: (orders || []).length, total_value: Math.round(totalValue * 100) / 100 },
    })
  } catch (error) {
    console.error('Error fetching customer order analytics:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
