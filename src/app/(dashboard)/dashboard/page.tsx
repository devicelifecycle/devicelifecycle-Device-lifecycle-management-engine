'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  Clock,
  DollarSign,
  Gavel,
  Package,
  Plus,
  ShoppingCart,
  TrendingUp,
  Truck,
} from 'lucide-react'

const chartSkeleton = <div className="h-full animate-pulse rounded-2xl bg-muted dark:bg-white/[0.04]" />
const MonthlyOrdersChart = dynamic(() => import('./_charts').then(m => m.MonthlyOrdersChart), { ssr: false, loading: () => chartSkeleton })
const MonthlyValueChart = dynamic(() => import('./_charts').then(m => m.MonthlyValueChart), { ssr: false, loading: () => chartSkeleton })
const OrderMomentumChart = dynamic(() => import('./_charts').then(m => m.OrderMomentumChart), { ssr: false, loading: () => chartSkeleton })
const PipelineWeightChart = dynamic(() => import('./_charts').then(m => m.PipelineWeightChart), { ssr: false, loading: () => chartSkeleton })
import { getDefaultAppPathForRole } from '@/lib/auth-routing'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { useCustomerDashboard } from '@/hooks/useCustomerDashboard'
import { useDashboardCounts } from '@/hooks/useDashboardCounts'
import { useOrderAnalytics, useCustomerOrderAnalytics } from '@/hooks/useOrderAnalytics'
import { useSlaEarlyWarnings } from '@/hooks/useSlaEarlyWarnings'
import { useQuery } from '@tanstack/react-query'
import type { VendorBid, Order } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AnimatedCounter } from '@/components/ui/motion'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { CUSTOMER_STATUS_CONFIG, ORDER_STATUS_CONFIG } from '@/lib/constants'
import { StatusBadge } from '@/components/shared/StatusBadge'

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function MonthlyPerformanceSection({ isDark, analytics, isLoading }: { isDark: boolean; analytics?: { monthly: { month: string; order_count: number; total_value: number }[]; all_time: { total_orders: number; total_value: number } }; isLoading: boolean }) {
  const [range, setRange] = useState<'12m' | 'all'>('12m')

  const monthly = analytics?.monthly ?? []
  const allTime = analytics?.all_time
  const chartData = (range === '12m' ? monthly.slice(-12) : monthly).map(p => ({
    label: formatMonthLabel(p.month),
    orders: p.order_count,
    value: p.total_value,
  }))

  const tooltipStyle = {
    background: isDark ? 'rgba(18,14,12,0.95)' : '#fff',
    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0',
    borderRadius: '14px',
    color: isDark ? '#f5f5f4' : '#1c1917',
  }
  const tickStyle = { fill: isDark ? '#a8a29e' : '#78716c', fontSize: 11 }
  const gridStroke = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Monthly Performance</h2>
          <p className="text-sm text-muted-foreground mt-1">Order volume and value, grouped by month.</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border dark:border-white/10 p-1">
          <Button
            variant={range === '12m' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs rounded-lg"
            onClick={() => setRange('12m')}
          >
            Last 12 months
          </Button>
          <Button
            variant={range === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-3 text-xs rounded-lg"
            onClick={() => setRange('all')}
          >
            All time
          </Button>
        </div>
      </div>

      {/* All-time summary tiles */}
      <div className="grid grid-cols-2 gap-4">
        <div className="metric-tile p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">All-Time Orders</p>
          <div className="mt-2 text-3xl font-semibold text-foreground">
            {isLoading ? '—' : (allTime?.total_orders ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="metric-tile p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">All-Time Value</p>
          <div className="mt-2 text-3xl font-semibold text-foreground">
            {isLoading ? '—' : formatCurrency(allTime?.total_value ?? 0)}
          </div>
        </div>
      </div>

      {/* Monthly charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="surface-panel overflow-hidden border-border dark:border-white/8 bg-transparent">
          <CardHeader>
            <CardTitle className="text-xl text-foreground">Orders by Month</CardTitle>
            <CardDescription className="text-muted-foreground">Non-cancelled orders per calendar month.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            {isLoading ? (
              <div className="h-full animate-pulse rounded-2xl bg-muted dark:bg-white/[0.04]" />
            ) : chartData.length === 0 ? (
              <p className="pt-16 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <MonthlyOrdersChart chartData={chartData} gridStroke={gridStroke} tickStyle={tickStyle} tooltipStyle={tooltipStyle} />
            )}
          </CardContent>
        </Card>

        <Card className="surface-panel overflow-hidden border-border dark:border-white/8 bg-transparent">
          <CardHeader>
            <CardTitle className="text-xl text-foreground">Order Value by Month</CardTitle>
            <CardDescription className="text-muted-foreground">Total order value per calendar month.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            {isLoading ? (
              <div className="h-full animate-pulse rounded-2xl bg-muted dark:bg-white/[0.04]" />
            ) : chartData.length === 0 ? (
              <p className="pt-16 text-center text-sm text-muted-foreground">No order value yet.</p>
            ) : (
              <MonthlyValueChart chartData={chartData} gridStroke={gridStroke} tickStyle={tickStyle} tooltipStyle={tooltipStyle} />
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

const PIPELINE_COLORS = ['#1e3a8a', '#3b82f6', '#6ec6b8', '#8da8d8', '#d95f5f', '#f0c36d']

function useTrend(orders: Array<{ created_at?: string | null }>) {
  return useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - index))
      const key = date.toISOString().slice(0, 10)
      return {
        label: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Toronto' }),
        orders: orders.filter((order) => order.created_at?.slice(0, 10) === key).length,
      }
    })
  }, [orders])
}

function usePipeline(orders: Array<{ status: string }>) {
  return useMemo(() => {
    const counts = new Map<string, number>()
    for (const order of orders) {
      counts.set(order.status, (counts.get(order.status) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([status, count], index) => ({
        label: ORDER_STATUS_CONFIG[status as keyof typeof ORDER_STATUS_CONFIG]?.label || status,
        count,
        fill: PIPELINE_COLORS[index % PIPELINE_COLORS.length],
      }))
  }, [orders])
}

function InternalDashboard({ user }: { user: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const { orders, total } = useOrders({ page_size: 50 })
  const counts = useDashboardCounts()
  const { data: analytics, isLoading: analyticsLoading } = useOrderAnalytics()
  // Previously recomputed on every render (sidebar toggle, theme switch, any
  // unrelated state change in this component) by re-scanning the full orders
  // array each time — memoized so these three only recompute when `orders`
  // actually changes.
  const { pendingOrders, slaAlerts, recentRevenue } = useMemo(() => ({
    pendingOrders: orders.filter((order) => ['submitted', 'quoted', 'sourcing', 'received', 'in_triage', 'qc_complete', 'mismatch_review', 'payment_processing'].includes(order.status)).length,
    slaAlerts: orders.filter((order) => order.is_sla_breached).length,
    recentRevenue: orders.reduce((sum, order) => sum + (order.total_amount || 0), 0),
  }), [orders])
  const trendData = useTrend(orders)
  const pipelineData = usePipeline(orders)
  const recentOrders = orders.slice(0, 6)

  const stats = useMemo(() => [
    { label: 'Total Orders', value: total, icon: ShoppingCart, tone: 'text-primary' },
    { label: 'Active Queue', value: pendingOrders, icon: Activity, tone: 'text-amber-400' },
    { label: 'SLA Alerts', value: slaAlerts, icon: AlertTriangle, tone: 'text-red-400' },
    { label: 'Revenue', value: formatCurrency(recentRevenue), icon: DollarSign, tone: 'text-emerald-400' },
  ], [total, pendingOrders, slaAlerts, recentRevenue])

  const isCoeRole = ['admin', 'coe_manager', 'coe_tech'].includes(user.role)
  const quickActions = useMemo(() => [
    { href: '/orders/new/trade-in', label: 'Create Trade-In', icon: Plus, description: 'Start a fresh device intake' },
    ...(isCoeRole ? [
      { href: '/orders/new/cpo', label: 'Create CPO Quote', icon: Package, description: 'Build a resale purchase flow' },
      { href: '/coe/triage', label: 'Open Triage', icon: ClipboardCheck, description: 'Review condition and exceptions' },
      { href: '/coe/shipping', label: 'Check Shipping', icon: Truck, description: 'Finalize outbound operations' },
    ] : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isCoeRole])

  return (
    <div className="relative space-y-8">
      <section className="surface-panel relative overflow-hidden rounded-[2rem] px-6 py-8 sm:px-8 lg:px-10">
        <div className="absolute inset-x-0 top-0 h-px copper-line opacity-80" />
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-6">
            <div className="space-y-4">
              <span className="eyebrow-label">Command Center</span>
              <div className="space-y-3">
                <h1 className="editorial-title max-w-3xl text-4xl text-foreground sm:text-5xl lg:text-6xl">
                  A sharper operating view for every <span className="brand-gradient">device journey</span>.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Welcome back, {user?.full_name || 'Operator'}. This workspace surfaces order flow, pricing pressure,
                  SLA risk, and fulfillment movement in one place.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="metric-tile h-full p-5 transition-transform duration-300 hover:-translate-y-1">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <p className="mb-1 text-base font-semibold text-foreground">{action.label}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{action.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Needs Attention strip — only shown when there is something to act on */}
      {((counts.pendingBids ?? 0) > 0 || (counts.actionableOrders ?? 0) > 0) && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(counts.pendingBids ?? 0) > 0 && (
            <Link href="/bids">
              <div className="flex items-center gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 transition hover:bg-amber-500/10">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                  <Gavel className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {counts.pendingBids} pending bid{counts.pendingBids === 1 ? '' : 's'} waiting
                  </p>
                  <p className="text-sm text-muted-foreground">Review and quote vendors → Bids</p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </Link>
          )}
          {(counts.actionableOrders ?? 0) > 0 && (
            <Link href="/orders">
              <div className="flex items-center gap-4 rounded-2xl border border-blue-500/30 bg-blue-500/5 px-5 py-4 transition hover:bg-blue-500/10">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {counts.actionableOrders} order{counts.actionableOrders === 1 ? '' : 's'} need attention
                  </p>
                  <p className="text-sm text-muted-foreground">Quoted or accepted, awaiting next step → Orders</p>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </Link>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="metric-tile p-6"
          >
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
                <div className="mt-3 text-4xl font-semibold text-foreground">
                  {typeof stat.value === 'number' ? <AnimatedCounter value={stat.value} /> : stat.value}
                </div>
              </div>
              <div className={stat.tone}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
            <div className="h-px w-full copper-line opacity-60" />
          </motion.div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="surface-panel overflow-hidden border-border dark:border-white/8 bg-transparent">
          <CardHeader>
            <CardTitle className="text-2xl text-foreground">Order Momentum</CardTitle>
            <CardDescription className="text-muted-foreground">Volume over the last seven days.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] sm:h-[320px]">
            <OrderMomentumChart trendData={trendData} isDark={isDark} />
          </CardContent>
        </Card>

        <Card className="surface-panel overflow-hidden border-border dark:border-white/8 bg-transparent">
          <CardHeader>
            <CardTitle className="text-2xl text-foreground">Pipeline Weight</CardTitle>
            <CardDescription className="text-muted-foreground">Where operational effort is concentrated now.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] sm:h-[320px]">
            <PipelineWeightChart pipelineData={pipelineData} isDark={isDark} />
          </CardContent>
        </Card>
      </section>

      <MonthlyPerformanceSection isDark={isDark} analytics={analytics} isLoading={analyticsLoading} />

      <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Card className="surface-panel overflow-hidden border-border dark:border-white/8 bg-transparent">
          <CardHeader className="flex-row items-end justify-between space-y-0">
            <div>
              <CardTitle className="text-2xl text-foreground">Recent Activity</CardTitle>
              <CardDescription className="mt-2 text-muted-foreground">Latest orders and where they sit.</CardDescription>
            </div>
            <Link href="/orders" className="text-sm text-primary hover:text-primary/70">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentOrders.length === 0 && (
              <div className="rounded-[1.4rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.02] px-5 py-10 text-center text-sm text-muted-foreground">
                No recent orders yet.
              </div>
            )}
            {recentOrders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <div className="rounded-[1.4rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.03] px-5 py-4 transition hover:bg-muted/60 dark:hover:bg-white/[0.05]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{order.order_number || 'Untitled Order'}</p>
                      <p className="text-sm text-muted-foreground">
                        {order.type === 'cpo' ? 'CPO workflow' : 'Trade-in workflow'} · Updated{' '}
                        {formatRelativeTime(order.updated_at || order.created_at || new Date().toISOString())}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge
                        status={order.status}
                        label={ORDER_STATUS_CONFIG[order.status as keyof typeof ORDER_STATUS_CONFIG]?.label}
                        dot
                      />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="surface-panel overflow-hidden border-border dark:border-white/8 bg-transparent">
          <CardHeader>
            <CardTitle className="text-2xl text-foreground">Operational Notes</CardTitle>
            <CardDescription className="text-muted-foreground">A quick read of today’s posture.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[1.4rem] border border-border dark:border-white/8 bg-muted/40 dark:bg-white/[0.035] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Queue</p>
              <p className="text-lg font-semibold text-foreground">{pendingOrders} orders need active handling.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Submitted, quoted, sourcing, receiving, and triage work are grouped into the active queue so the team can
                prioritize throughput instead of scanning every status manually.
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-border dark:border-white/8 bg-muted/40 dark:bg-white/[0.035] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Revenue Surface</p>
              <p className="text-lg font-semibold text-foreground">{formatCurrency(recentRevenue)} in visible order value.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This is drawn from the currently loaded order set and gives finance and sales a quick directional read on the
                active book of business.
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-border dark:border-white/8 bg-muted/40 dark:bg-white/[0.035] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">SLA Risk</p>
              <p className="text-lg font-semibold text-foreground">{slaAlerts} breached or at-risk orders flagged.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Keep an eye on exceptions and triage if this number climbs. It’s usually the earliest signal that the system
                needs operational rebalancing.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <SlaEarlyWarningsSection />
    </div>
  )
}

function SlaEarlyWarningsSection() {
  const { data, isLoading } = useSlaEarlyWarnings()
  const warnings = data?.warnings ?? []

  if (!isLoading && warnings.length === 0) return null

  return (
    <Card className="surface-panel overflow-hidden border-amber-500/20 dark:border-amber-500/15 bg-transparent">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-2xl text-foreground">
            <TrendingUp className="h-5 w-5 text-amber-500" />
            Pacing Behind Normal
          </CardTitle>
          <CardDescription className="mt-2 text-muted-foreground">
            Orders taking noticeably longer at their current stage than similar orders typically do — flagged before the formal SLA threshold, based on historical averages, not a fixed cutoff.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-6"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
        ) : (
          warnings.slice(0, 8).map((w) => (
            <Link key={w.order_id} href={`/orders/${w.order_id}`}>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border dark:border-white/8 bg-card dark:bg-white/[0.03] px-5 py-3 transition hover:bg-muted/60 dark:hover:bg-white/[0.05]">
                <div>
                  <p className="font-semibold text-foreground">{w.order_number}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 capitalize">{w.status.replace(/_/g, ' ')} · {w.order_type.replace(/_/g, ' ')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-amber-500">{w.pace_ratio}x typical pace</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{w.hours_in_status}h vs ~{w.baseline_avg_hours}h usual</p>
                </div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function CustomerDashboard({ user }: { user: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const { summary, recentOrders, isLoading, error } = useCustomerDashboard()
  const { data: analytics, isLoading: analyticsLoading } = useCustomerOrderAnalytics()
  const totalOrders = summary?.total_orders || 0
  const activeOrders = summary?.active_orders || 0
  const quotesReady = summary?.quotes_ready || 0
  const completedOrders = summary?.completed_orders || 0
  const visibleValue = summary?.visible_value || 0

  const stats = useMemo(() => [
    { label: 'Total Orders', value: totalOrders, icon: ShoppingCart, tone: 'text-primary' },
    { label: 'Active Orders', value: activeOrders, icon: Activity, tone: 'text-amber-400' },
    { label: 'Quotes Ready', value: quotesReady, icon: ClipboardCheck, tone: 'text-blue-400' },
    { label: 'Completed', value: completedOrders, icon: Truck, tone: 'text-emerald-400' },
  ], [totalOrders, activeOrders, quotesReady, completedOrders])

  const quickActions = useMemo(() => [
    { href: '/orders/new', label: 'New Order', icon: Plus, description: 'Create a request.' },
    { href: '/customer/orders', label: 'My Orders', icon: ShoppingCart, description: 'See latest updates.' },
    { href: '/value-lookup', label: 'Residual Value Quote', icon: DollarSign, description: 'Estimate a device’s trade-in value.' },
  ], [])

  return (
    <div className="relative space-y-8">
      <section className="surface-panel relative overflow-hidden rounded-[2rem] px-6 py-8 sm:px-8 lg:px-10">
        <div className="absolute inset-x-0 top-0 h-px copper-line opacity-80" />
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <span className="eyebrow-label">Customer Workspace</span>
            <div className="space-y-3">
              <h1 className="editorial-title max-w-3xl text-4xl text-foreground sm:text-5xl">
                Orders, quotes, and shipments in one view.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Welcome back, {user.full_name || 'Customer'}.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="metric-tile h-full p-5 transition-transform duration-300 hover:-translate-y-1">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <p className="mb-1 text-base font-semibold text-foreground">{action.label}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{action.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="metric-tile p-6"
          >
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
                <div className="mt-3 text-4xl font-semibold text-foreground">
                  {typeof stat.value === 'number' ? <AnimatedCounter value={stat.value} /> : stat.value}
                </div>
              </div>
              <div className={stat.tone}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
            <div className="h-px w-full copper-line opacity-60" />
          </motion.div>
        ))}
      </section>

      <MonthlyPerformanceSection isDark={isDark} analytics={analytics} isLoading={analyticsLoading} />

      <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Card className="surface-panel overflow-hidden border-border dark:border-white/8 bg-transparent">
          <CardHeader className="flex-row items-end justify-between space-y-0">
            <div>
              <CardTitle className="text-2xl text-foreground">Recent Orders</CardTitle>
              <CardDescription className="mt-2 text-muted-foreground">Latest updates.</CardDescription>
            </div>
            <Link href="/customer/orders" className="text-sm text-primary hover:text-primary/70">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && (
              <div className="rounded-[1.4rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.02] px-5 py-10 text-center text-sm text-muted-foreground">
                Loading your orders...
              </div>
            )}
            {!isLoading && error && (
              <div className="rounded-[1.4rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.02] px-5 py-10 text-center text-sm text-muted-foreground">
                Unable to load orders. Please refresh the page.
              </div>
            )}
            {!isLoading && !error && recentOrders.length === 0 && (
              <div className="space-y-4 rounded-[1.4rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.02] px-5 py-10 text-center">
                <div>
                  <p className="text-base font-semibold text-foreground">No orders yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Create your first order to get started.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link href="/orders/new">
                    <Button variant="success">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Order
                    </Button>
                  </Link>
                </div>
              </div>
            )}
            {!isLoading && !error && recentOrders.map((order) => (
              <Link key={order.id} href={`/customer/orders/${order.id}`}>
                <div className="rounded-[1.4rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.03] px-5 py-4 transition hover:bg-muted/60 dark:hover:bg-white/[0.05]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{order.order_number || 'Untitled Order'}</p>
                      <p className="text-sm text-muted-foreground">
                        {order.type === 'cpo' ? 'CPO' : 'Trade-In'} · Updated{' '}
                        {formatRelativeTime(order.updated_at || order.created_at || new Date().toISOString())}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge
                        status={order.status}
                        label={CUSTOMER_STATUS_CONFIG[order.status as keyof typeof CUSTOMER_STATUS_CONFIG]?.label}
                        dot
                      />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="surface-panel overflow-hidden border-border dark:border-white/8 bg-transparent">
          <CardHeader>
            <CardTitle className="text-2xl text-foreground">Overview</CardTitle>
            <CardDescription className="text-muted-foreground">Current status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[1.4rem] border border-border dark:border-white/8 bg-muted/40 dark:bg-white/[0.035] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">In Progress</p>
              <p className="text-lg font-semibold text-foreground">{activeOrders} active order{activeOrders === 1 ? '' : 's'}.</p>
            </div>
            <div className="rounded-[1.4rem] border border-border dark:border-white/8 bg-muted/40 dark:bg-white/[0.035] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Visible Value</p>
              <p className="text-lg font-semibold text-foreground">{formatCurrency(visibleValue)}</p>
            </div>
            <div className="rounded-[1.4rem] border border-border dark:border-white/8 bg-muted/40 dark:bg-white/[0.035] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Next Action</p>
              <p className="text-lg font-semibold text-foreground">
                {quotesReady > 0 ? `${quotesReady} quote${quotesReady === 1 ? ' is' : 's are'} ready.` : 'No quotes waiting.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

type BidWithOrder = VendorBid & { order?: { id: string; order_number: string; status: string; total_quantity: number } }

function VendorDashboard({ user }: { user: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const { data: bidsData } = useQuery<{ data: BidWithOrder[] }>({
    queryKey: ['vendor-my-bids'],
    queryFn: async () => {
      const res = await fetch('/api/vendors/bids')
      if (!res.ok) return { data: [] }
      return res.json()
    },
    refetchInterval: 60_000,
  })
  const { orders: assignedOrders, total: assignedTotal } = useOrders({ page_size: 20 })

  const allBids: BidWithOrder[] = bidsData?.data || []
  const { pendingBids, acceptedBids, actionableOrders } = useMemo(() => ({
    pendingBids: allBids.filter(b => b.status === 'pending'),
    acceptedBids: allBids.filter(b => b.status === 'accepted'),
    actionableOrders: assignedOrders.filter(o => ['accepted', 'sourcing', 'sourced'].includes(o.status)),
  }), [allBids, assignedOrders])

  const quickActions = useMemo(() => [
    { href: '/vendor/orders', label: 'Browse Open Orders', icon: Package, description: 'Find CPO orders to bid on' },
    { href: '/vendor/bids', label: 'My Bids', icon: Gavel, description: 'Track all your submitted bids' },
  ], [])

  return (
    <div className="relative space-y-8">
      <section className="surface-panel relative overflow-hidden rounded-[2rem] px-6 py-8 sm:px-8 lg:px-10">
        <div className="absolute inset-x-0 top-0 h-px copper-line opacity-80" />
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <span className="eyebrow-label">Vendor Workspace</span>
            <div className="space-y-3">
              <h1 className="editorial-title max-w-3xl text-4xl text-foreground sm:text-5xl">
                Your bids and fulfillment work in one place.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                Welcome back, {user.full_name || 'Vendor'}. Check pending bids, assigned orders, and open opportunities below.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/vendor/orders">
                <Button size="lg"><Plus className="mr-2 h-4 w-4" />Browse Open Orders</Button>
              </Link>
              <Link href="/vendor/bids">
                <Button size="lg" variant="outline"><Gavel className="mr-2 h-4 w-4" />My Bids</Button>
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="metric-tile h-full p-5 transition-transform duration-300 hover:-translate-y-1">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <p className="mb-1 text-base font-semibold text-foreground">{action.label}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{action.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Pending Bids', value: pendingBids.length, icon: Gavel, tone: 'text-amber-400' },
          { label: 'Accepted Bids', value: acceptedBids.length, icon: Activity, tone: 'text-emerald-400' },
          { label: 'Orders Assigned', value: assignedTotal, icon: Truck, tone: 'text-primary' },
        ].map((stat, index) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }} className="metric-tile p-6">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
                <div className="mt-3 text-4xl font-semibold text-foreground"><AnimatedCounter value={stat.value} /></div>
              </div>
              <div className={stat.tone}><stat.icon className="h-6 w-6" /></div>
            </div>
            <div className="h-px w-full copper-line opacity-60" />
          </motion.div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="surface-panel overflow-hidden border-border dark:border-white/8 bg-transparent">
          <CardHeader className="flex-row items-end justify-between space-y-0">
            <div>
              <CardTitle className="text-2xl text-foreground">Pending Bids</CardTitle>
              <CardDescription className="mt-2 text-muted-foreground">Awaiting admin decision.</CardDescription>
            </div>
            <Link href="/vendor/bids" className="text-sm text-primary hover:text-primary/70">View all</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingBids.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.02] px-5 py-8 text-center text-sm text-muted-foreground">
                No pending bids.
              </div>
            ) : pendingBids.slice(0, 5).map((bid) => {
              const daysLeft = bid.expires_at ? Math.ceil((new Date(bid.expires_at).getTime() - Date.now()) / 86400000) : null
              return (
                <Link key={bid.id} href={bid.order ? `/orders/${bid.order.id}` : '/vendor/bids'}>
                  <div className="rounded-[1.4rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.03] px-5 py-4 transition hover:bg-muted/60 dark:hover:bg-white/[0.05]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">
                          {bid.order ? `#${bid.order.order_number}` : 'Order'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {bid.quantity} units · {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(bid.unit_price)}/unit
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        {daysLeft !== null && daysLeft > 0 && (
                          <span className={`flex items-center gap-1 text-xs font-medium ${daysLeft <= 3 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                            <Clock className="h-3 w-3" />
                            {daysLeft}d left
                          </span>
                        )}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>

        <Card className="surface-panel overflow-hidden border-border dark:border-white/8 bg-transparent">
          <CardHeader className="flex-row items-end justify-between space-y-0">
            <div>
              <CardTitle className="text-2xl text-foreground">Orders Needing Action</CardTitle>
              <CardDescription className="mt-2 text-muted-foreground">Assigned orders with next steps.</CardDescription>
            </div>
            <Link href="/vendor/orders" className="text-sm text-primary hover:text-primary/70">View all</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {actionableOrders.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.02] px-5 py-8 text-center text-sm text-muted-foreground">
                No orders needing action right now.
              </div>
            ) : actionableOrders.slice(0, 5).map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <div className="rounded-[1.4rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.03] px-5 py-4 transition hover:bg-muted/60 dark:hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{order.order_number}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{order.status.replace(/_/g, ' ')} · {order.total_quantity ?? 0} units</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, isInitializing } = useAuth()
  const isInternal = user ? ['admin', 'coe_manager', 'coe_tech', 'sales'].includes(user.role) : false
  const isCustomer = user?.role === 'customer'
  const isVendor = user?.role === 'vendor'
  const targetPath = getDefaultAppPathForRole(user?.role)

  useEffect(() => {
    if (!isInitializing && user && !isInternal && !isCustomer && !isVendor) {
      router.replace(targetPath)
    }
  }, [isCustomer, isInitializing, isInternal, isVendor, router, targetPath, user])

  if (isInitializing || !user) {
    return (
      <div className="surface-panel rounded-[1.75rem] px-6 py-12 text-center text-muted-foreground">
        Loading your workspace...
      </div>
    )
  }

  if (isCustomer) return <CustomerDashboard user={user} />
  if (isVendor) return <VendorDashboard user={user} />

  if (!isInternal) {
    return (
      <div className="surface-panel rounded-[1.75rem] px-6 py-12 text-center text-muted-foreground">
        Opening your workspace...
      </div>
    )
  }

  return <InternalDashboard user={user} />
}
