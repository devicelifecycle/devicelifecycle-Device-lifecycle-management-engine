// ============================================================================
// REPORTS API
// ============================================================================
// Returns aggregated analytics: order volumes, revenue, top devices,
// margin health, competitor coverage, SLA performance, daily trends.
// All queries run server-side against the full dataset (no 200-row cap).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, profile } = auth
    if (!['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const days = Math.min(parseInt(request.nextUrl.searchParams.get('days') || '30'), 365)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // ── Order summary — computed server-side via a single aggregate RPC ─────
    // instead of paginating the entire orders table into this route and
    // reducing it in JS. Field names/values verified identical to the
    // previous JS computation across multiple `days` values before cutover.
    const { data: summary, error: summaryError } = await supabase.rpc('get_reports_summary', { p_days: days })
    if (summaryError) throw summaryError

    const total = summary.total as number
    const active = summary.active as number
    const tradeIn = summary.trade_in as number
    const cpo = summary.cpo as number
    const totalValue = Number(summary.total_value)
    const valuedOrderCount = summary.valued_order_count as number
    const periodOrders = summary.period_orders as number
    const prevPeriodOrders = summary.prev_period_orders as number
    const periodRevenue = Number(summary.period_revenue)
    const prevPeriodRevenue = Number(summary.prev_period_revenue)
    const completed = summary.completed as number
    const cancelled = summary.cancelled as number
    const byStatus = summary.by_status as Record<string, number>
    const daily = summary.daily as Array<{ date: string; count: number; revenue: number }>
    // 'completed' isn't a real order_status enum value (same as the RPC's own
    // active/completed filters) — kept here only because terminal_total is a
    // separate response field never covered by the RPC's own `completed`.
    const TERMINAL = ['completed', 'closed', 'delivered', 'cancelled', 'rejected']

    // ── Top devices + coverage counts — all independent, run in parallel ────
    const [
      { data: itemRows },
      { count: competitorPriceCount },
      { count: devicesWithPrices },
      { count: slaBreachCount },
      { count: openExceptions },
    ] = await Promise.all([
      supabase
        .from('order_items')
        .select('device_id, trade_in_price, created_at, device_catalog!inner(make,model)')
        .gte('created_at', since)
        .limit(2000),
      supabase
        .from('competitor_prices')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('competitor_prices')
        .select('device_id', { count: 'exact', head: true })
        .not('trade_in_price', 'is', null),
      supabase
        .from('sla_breaches')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since),
      supabase
        .from('order_exceptions')
        .select('id', { count: 'exact', head: true })
        .in('approval_status', ['pending', 'coe_approved']),
    ])

    const deviceMap = new Map<string, { make: string; model: string; count: number; total: number }>()
    for (const row of (itemRows || []) as unknown as Array<{
      device_id: string; trade_in_price: number | null;
      device_catalog: { make: string; model: string } | null
    }>) {
      const key = row.device_id
      const catalog = row.device_catalog
      if (!catalog) continue
      const existing = deviceMap.get(key) || { make: catalog.make, model: catalog.model, count: 0, total: 0 }
      existing.count++
      existing.total += row.trade_in_price || 0
      deviceMap.set(key, existing)
    }
    const topDevices = Array.from(deviceMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const response = NextResponse.json({
      period_days: days,
      orders: {
        total,
        active,
        by_status: byStatus,
        by_type: { trade_in: tradeIn, cpo },
        total_value: totalValue,
        avg_value: valuedOrderCount > 0 ? Math.round((totalValue / valuedOrderCount) * 100) / 100 : 0,
        completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
        cancellation_rate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
        terminal_total: TERMINAL.reduce((sum, s) => sum + (byStatus[s] || 0), 0),
        this_period: periodOrders,
        prev_period: prevPeriodOrders,
        period_growth: prevPeriodOrders > 0
          ? Math.round(((periodOrders - prevPeriodOrders) / prevPeriodOrders) * 100)
          : null,
      },
      revenue: {
        total: totalValue,
        this_period: periodRevenue,
        prev_period: prevPeriodRevenue,
        period_growth: prevPeriodRevenue > 0
          ? Math.round(((periodRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100)
          : null,
        daily,
      },
      top_devices: topDevices,
      pricing: {
        total_competitor_prices: competitorPriceCount || 0,
        devices_with_prices: devicesWithPrices || 0,
      },
      operations: {
        sla_breaches_in_period: slaBreachCount || 0,
        open_exceptions: openExceptions || 0,
      },
    })
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')
    return response
  } catch (error) {
    console.error('[reports]', error)
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 })
  }
}
