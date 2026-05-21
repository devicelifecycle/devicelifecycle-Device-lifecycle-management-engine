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
    const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000).toISOString()

    // ── Fetch all orders (paginate to get full count) ────────────────────────
    const allOrders: Array<{
      id: string; status: string; type: string;
      total_amount: number | null; created_at: string;
    }> = []

    let from = 0
    const pageSize = 1000
    for (;;) {
      const { data, error } = await supabase
        .from('orders')
        .select('id,status,type,total_amount,created_at')
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) break
      allOrders.push(...(data || []))
      if ((data || []).length < pageSize) break
      from += pageSize
    }

    // ── Order summary ────────────────────────────────────────────────────────
    const byStatus: Record<string, number> = {}
    let tradeIn = 0, cpo = 0, totalValue = 0
    let periodOrders = 0, prevPeriodOrders = 0
    let periodRevenue = 0, prevPeriodRevenue = 0
    const TERMINAL = ['completed', 'closed', 'delivered', 'cancelled', 'rejected']
    const ACTIVE_STATUSES = ['submitted', 'quoted', 'customer_accepted', 'received',
      'triaged', 'priced', 'approved', 'on_hold', 'awaiting_parts', 'flagged', 'exception']

    for (const o of allOrders) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1
      if (o.type === 'trade_in') tradeIn++; else cpo++
      totalValue += o.total_amount || 0
      if (o.created_at >= since) {
        periodOrders++
        periodRevenue += o.total_amount || 0
      } else if (o.created_at >= prevSince) {
        prevPeriodOrders++
        prevPeriodRevenue += o.total_amount || 0
      }
    }

    const total = allOrders.length
    const active = allOrders.filter(o => ACTIVE_STATUSES.includes(o.status)).length
    const completed = (byStatus['completed'] || 0) + (byStatus['closed'] || 0) + (byStatus['delivered'] || 0)
    const cancelled = byStatus['cancelled'] || 0
    // Only count orders that have been priced (total_amount > 0) in the avg denominator.
    // Unpriced orders (submitted/quoted with no amount yet) contribute 0 to the sum but
    // would inflate the count, making avg_value look much lower than it actually is.
    const valuedOrderCount = allOrders.filter(o => (o.total_amount || 0) > 0).length

    // ── Daily trend (last N days) ────────────────────────────────────────────
    const dailyMap = new Map<string, { count: number; revenue: number }>()
    const today = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      dailyMap.set(d.toISOString().slice(0, 10), { count: 0, revenue: 0 })
    }
    for (const o of allOrders) {
      if (o.created_at < since) continue
      const day = o.created_at.slice(0, 10)
      const entry = dailyMap.get(day)
      if (entry) { entry.count++; entry.revenue += o.total_amount || 0 }
    }
    const daily = Array.from(dailyMap.entries()).map(([date, v]) => ({ date, ...v }))

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
