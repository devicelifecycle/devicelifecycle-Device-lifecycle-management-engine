import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ensureCustomerProfileForOrganization } from '@/lib/customer-profile'

export const dynamic = 'force-dynamic'

const CUSTOMER_TERMINAL_STATUSES = ['delivered', 'closed', 'cancelled', 'rejected'] as const
const CUSTOMER_COMPLETED_STATUSES = ['delivered', 'closed'] as const

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role, organization_id, full_name, email, notification_email, phone')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    if (profile.role !== 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json(
        {
          total_orders: 0,
          active_orders: 0,
          quotes_ready: 0,
          completed_orders: 0,
          visible_value: 0,
          recent_orders: [],
        },
        { status: 200 }
      )
    }

    const serviceRole = createServiceRoleClient()

    // Use the canonical customer record for this organization.
    // We intentionally use only this ONE customer record (not all customers
    // for the org) so the dashboard reflects only THIS customer's orders —
    // not orders from other customer accounts that may share the same org.
    let canonicalCustomerId: string | null = null
    try {
      const customer = await ensureCustomerProfileForOrganization(serviceRole, profile.organization_id, profile)
      canonicalCustomerId = customer.id
    } catch {
      // Organization or customer profile not yet set up — return empty dashboard
      return NextResponse.json(
        {
          total_orders: 0,
          active_orders: 0,
          quotes_ready: 0,
          completed_orders: 0,
          visible_value: 0,
          recent_orders: [],
        },
        { status: 200 }
      )
    }

    if (!canonicalCustomerId) {
      return NextResponse.json(
        {
          total_orders: 0,
          active_orders: 0,
          quotes_ready: 0,
          completed_orders: 0,
          visible_value: 0,
          recent_orders: [],
        },
        { status: 200 }
      )
    }

    const customerIds = [canonicalCustomerId]

    const [totalResult, activeResult, quotedResult, completedResult, valueResult, recentResult] =
      await Promise.all([
        serviceRole.from('orders').select('id', { count: 'exact', head: true }).in('customer_id', customerIds),
        serviceRole
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('customer_id', customerIds)
          .not('status', 'in', `(${CUSTOMER_TERMINAL_STATUSES.join(',')})`),
        serviceRole
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('customer_id', customerIds)
          .eq('status', 'quoted'),
        serviceRole
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('customer_id', customerIds)
          .in('status', [...CUSTOMER_COMPLETED_STATUSES]),
        serviceRole
          .from('orders')
          .select('quoted_amount, total_amount')
          .in('customer_id', customerIds),
        serviceRole
          .from('orders')
          .select('id, order_number, type, status, quoted_amount, total_amount, created_at, updated_at')
          .in('customer_id', customerIds)
          .order('updated_at', { ascending: false })
          .limit(6),
      ])

    const firstError =
      totalResult.error ||
      activeResult.error ||
      quotedResult.error ||
      completedResult.error ||
      valueResult.error ||
      recentResult.error

    if (firstError) {
      throw firstError
    }

    const visibleValue = (valueResult.data || []).reduce((sum, order) => {
      return sum + (order.quoted_amount ?? order.total_amount ?? 0)
    }, 0)

    return NextResponse.json({
      total_orders: totalResult.count || 0,
      active_orders: activeResult.count || 0,
      quotes_ready: quotedResult.count || 0,
      completed_orders: completedResult.count || 0,
      visible_value: Math.round(visibleValue * 100) / 100,
      recent_orders: recentResult.data || [],
    })
  } catch (error) {
    console.error('Error fetching customer dashboard:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 })
  }
}
