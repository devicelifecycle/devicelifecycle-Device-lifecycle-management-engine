// ============================================================================
// MY REPORTS SUMMARY — roll-up counters for the customer reports page.
// ============================================================================
// Scoped exactly like /api/customers/me/orders/export: the caller must be a
// customer with an organization, and every query runs against that customer's
// own rows. Money sums share the export's 1000-order window; asset counts use
// exact head queries so they stay correct past any window.

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

const MAX_ORDERS = 1000

// Statuses that end an order's life — everything else counts as active.
const TERMINAL_STATUSES = ['closed', 'cancelled', 'rejected']

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { effectiveRole, profile } = auth

    if (effectiveRole !== 'customer') {
      return NextResponse.json({ error: 'Forbidden — customer role required' }, { status: 403 })
    }
    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with this account' }, { status: 400 })
    }

    const serviceRole = createServiceRoleClient()
    const { data: customer } = await serviceRole
      .from('customers')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 })
    }

    const assetCount = (status?: string) => {
      let query = serviceRole.from('customer_assets').select('id', { count: 'exact', head: true }).eq('customer_id', customer.id)
      if (status) query = query.eq('status', status)
      return query
    }

    const [ordersRes, totalRes, registeredRes, assignedRes, retiredRes] = await Promise.all([
      serviceRole
        .from('orders')
        .select('type, status, quoted_amount, total_amount')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(MAX_ORDERS),
      assetCount(),
      assetCount('registered'),
      assetCount('assigned'),
      assetCount('retired'),
    ])

    const rows = ordersRes.data || []
    const tradeInValue = rows.reduce(
      (sum, o) => (o.type === 'trade_in' ? sum + (o.quoted_amount ?? o.total_amount ?? 0) : sum),
      0
    )

    return NextResponse.json({
      data: {
        orders: {
          total: rows.length,
          active: rows.filter((o) => !TERMINAL_STATUSES.includes(o.status)).length,
        },
        tradeInValue,
        assets: {
          total: totalRes.count ?? 0,
          registered: registeredRes.count ?? 0,
          assigned: assignedRes.count ?? 0,
          retired: retiredRes.count ?? 0,
        },
      },
    })
  } catch (error) {
    console.error('Error loading report summary:', error)
    return NextResponse.json({ error: 'Failed to load report summary' }, { status: 500 })
  }
}