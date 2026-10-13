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

    // Order COUNTS are exact head queries, not the length of the windowed row
    // fetch below — otherwise a customer past MAX_ORDERS would see a capped
    // "total orders" metric directly above an order-history card showing their
    // real (larger) total.
    const orderTotalCount = serviceRole
      .from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customer.id)
    const orderActiveCount = serviceRole
      .from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customer.id)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)

    const [ordersRes, orderTotalRes, orderActiveRes, totalRes, registeredRes, assignedRes, retiredRes] = await Promise.all([
      serviceRole
        .from('orders')
        .select('type, status, quoted_amount, total_amount')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(MAX_ORDERS),
      orderTotalCount,
      orderActiveCount,
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

    // Resolve customer's plan/license limits
    const { data: org } = await serviceRole
      .from('organizations')
      .select('id, tenant_id')
      .eq('id', profile.organization_id)
      .maybeSingle()

    let plan: { name: string; limits: Record<string, unknown> } | null = null
    let usage: { users: number; storage_bytes: number | null } | null = null

    if (org) {
      // Check for per-customer plan override
      const { data: custRow } = await serviceRole
        .from('customers')
        .select('plan_id, plan:subscription_plans(name, limits)')
        .eq('id', customer.id)
        .maybeSingle()

      if (custRow?.plan) {
        plan = custRow.plan as unknown as { name: string; limits: Record<string, unknown> }
      } else if (org.tenant_id) {
        const { data: tenant } = await serviceRole
          .from('tenants')
          .select('plan')
          .eq('id', org.tenant_id)
          .maybeSingle()
        if (tenant?.plan) {
          const { data: tenantPlan } = await serviceRole
            .from('subscription_plans')
            .select('name, limits')
            .eq('slug', tenant.plan)
            .maybeSingle()
          if (tenantPlan) plan = tenantPlan as { name: string; limits: Record<string, unknown> }
        }
      }

      // User count for this org
      const { count: userCount } = await serviceRole
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)

      // Storage usage from objects (if tenant has storage tracking)
      let storageBytes: number | null = null
      if (org.tenant_id) {
        const { data: usageRow } = await serviceRole
          .rpc('measure_tenant_storage', { p_tenant_id: org.tenant_id })
        if (usageRow != null) {
          storageBytes = typeof usageRow === 'number' ? usageRow : (usageRow as { total_bytes?: number })?.total_bytes ?? null
        }
      }

      usage = { users: userCount ?? 0, storage_bytes: storageBytes }
    }

    return NextResponse.json({
      data: {
        orders: {
          total: orderTotalRes.count ?? rows.length,
          active: orderActiveRes.count ?? rows.filter((o) => !TERMINAL_STATUSES.includes(o.status)).length,
        },
        tradeInValue,
        assets: {
          total: totalRes.count ?? 0,
          registered: registeredRes.count ?? 0,
          assigned: assignedRes.count ?? 0,
          retired: retiredRes.count ?? 0,
        },
        plan: plan ? { name: plan.name, limits: plan.limits } : null,
        usage,
      },
    })
  } catch (error) {
    console.error('Error loading report summary:', error)
    return NextResponse.json({ error: 'Failed to load report summary' }, { status: 500 })
  }
}