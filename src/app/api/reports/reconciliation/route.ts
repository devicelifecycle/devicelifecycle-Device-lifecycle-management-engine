// ============================================================================
// DISCREPANCY RECONCILIATION REPORT API
// GET /api/reports/reconciliation?days=30&order_type=trade_in|cpo|all
// ============================================================================
// Returns a side-by-side view of:
//   Trade-In: customer claimed condition/value vs COE actual condition/adjustment
//   CPO:      vendor quoted price vs COE assessed value
// Restricted to internal roles only (admin, coe_manager, coe_tech, sales).

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const days = Math.min(parseInt(params.get('days') || '30'), 365)
    const orderTypeFilter = params.get('order_type') || 'all'
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // ── Fetch triage results with order + item + device context ─────────────
    const { data: triageRows, error: triageErr } = await supabase
      .from('triage_results')
      .select(`
        id,
        order_id,
        order_item_id,
        claimed_condition,
        actual_condition,
        price_adjustment,
        mismatch_severity,
        approval_status,
        created_at,
        order_items!inner(
          quantity,
          storage,
          unit_price,
          guaranteed_buyback_price,
          device_catalog!inner(make, model)
        ),
        orders!inner(
          order_number,
          type,
          status,
          customers(company_name),
          vendors(company_name)
        )
      `)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (triageErr) {
      console.error('[reconciliation] triage query error:', triageErr)
      return NextResponse.json({ error: 'Failed to load reconciliation data' }, { status: 500 })
    }

    type TriageRow = {
      id: string
      order_id: string
      order_item_id: string
      claimed_condition: string | null
      actual_condition: string | null
      price_adjustment: number | null
      mismatch_severity: string | null
      approval_status: string | null
      created_at: string
      order_items: {
        quantity: number | null
        storage: string | null
        unit_price: number | null
        guaranteed_buyback_price: number | null
        device_catalog: { make: string; model: string } | null
      } | null
      orders: {
        order_number: string | null
        type: string | null
        status: string | null
        customers: { company_name: string } | null
        vendors: { company_name: string } | null
      } | null
    }

    const rows = (triageRows || []) as unknown as TriageRow[]

    // ── Filter by order type if requested ───────────────────────────────────
    const filtered = rows.filter(r => {
      if (orderTypeFilter === 'trade_in') return r.orders?.type === 'trade_in'
      if (orderTypeFilter === 'cpo') return r.orders?.type === 'cpo'
      return true
    })

    // ── Build line items ─────────────────────────────────────────────────────
    const items = filtered.map(r => {
      const order = r.orders
      const item = r.order_items
      const device = item?.device_catalog
      const isCpo = order?.type === 'cpo'

      const claimedValue = isCpo
        ? (item?.guaranteed_buyback_price ?? item?.unit_price ?? 0)
        : (item?.unit_price ?? 0)
      const adjustment = r.price_adjustment ?? 0
      const coeValue = claimedValue + adjustment

      return {
        id: r.id,
        order_number: order?.order_number ?? '—',
        order_type: order?.type ?? 'unknown',
        order_status: order?.status ?? 'unknown',
        counterparty: isCpo
          ? (order?.vendors?.company_name ?? '—')
          : (order?.customers?.company_name ?? '—'),
        counterparty_label: isCpo ? 'Vendor' : 'Customer',
        device: device ? `${device.make} ${device.model}`.trim() : '—',
        storage: item?.storage ?? '—',
        quantity: item?.quantity ?? 1,
        claimed_condition: r.claimed_condition ?? '—',
        actual_condition: r.actual_condition ?? '—',
        condition_changed: r.claimed_condition !== r.actual_condition,
        claimed_value: claimedValue,
        coe_value: coeValue,
        price_adjustment: adjustment,
        mismatch_severity: r.mismatch_severity ?? 'minor',
        approval_status: r.approval_status ?? 'pending',
        created_at: r.created_at,
      }
    })

    // ── Aggregate summary ────────────────────────────────────────────────────
    const tradeInItems = items.filter(i => i.order_type === 'trade_in')
    const cpoItems = items.filter(i => i.order_type === 'cpo')

    const sumAdj = (arr: typeof items) =>
      arr.reduce((s, i) => s + (i.price_adjustment * (i.quantity ?? 1)), 0)

    const countByStatus = (arr: typeof items, status: string) =>
      arr.filter(i => i.approval_status === status).length

    const summary = {
      total_exceptions: items.length,
      condition_mismatches: items.filter(i => i.condition_changed).length,
      pending: items.filter(i => ['pending', 'coe_approved'].includes(i.approval_status)).length,
      resolved: items.filter(i => ['admin_approved', 'overridden', 'rejected'].includes(i.approval_status)).length,
      total_value_adjustment: sumAdj(items),
      by_type: {
        trade_in: {
          count: tradeInItems.length,
          total_adjustment: sumAdj(tradeInItems),
          pending: countByStatus(tradeInItems, 'pending'),
          approved: tradeInItems.filter(i => ['admin_approved', 'overridden'].includes(i.approval_status)).length,
        },
        cpo: {
          count: cpoItems.length,
          total_adjustment: sumAdj(cpoItems),
          pending: countByStatus(cpoItems, 'pending'),
          approved: cpoItems.filter(i => ['admin_approved', 'overridden'].includes(i.approval_status)).length,
        },
      },
      by_severity: {
        minor: items.filter(i => i.mismatch_severity === 'minor').length,
        moderate: items.filter(i => i.mismatch_severity === 'moderate').length,
        major: items.filter(i => i.mismatch_severity === 'major').length,
      },
    }

    return NextResponse.json({ period_days: days, summary, items })
  } catch (error) {
    console.error('[reconciliation]', error)
    return NextResponse.json({ error: 'Failed to generate reconciliation report' }, { status: 500 })
  }
}
