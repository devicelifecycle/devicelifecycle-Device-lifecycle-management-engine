'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  DollarSign,
  Package,
  Plus,
  ShoppingCart,
  Truck,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getDefaultAppPathForRole } from '@/lib/auth-routing'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AnimatedCounter } from '@/components/ui/motion'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import { StatusBadge } from '@/components/shared/StatusBadge'

const PIPELINE_COLORS = ['#f1d7af', '#d17843', '#6ec6b8', '#8da8d8', '#d95f5f', '#f0c36d']

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
  const { orders, total } = useOrders({ page_size: 50 })
  const pendingOrders = orders.filter((order) => ['submitted', 'quoted', 'sourcing', 'received', 'in_triage'].includes(order.status)).length
  const slaAlerts = orders.filter((order) => order.is_sla_breached).length
  const recentRevenue = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0)
  const trendData = useTrend(orders)
  const pipelineData = usePipeline(orders)
  const recentOrders = orders.slice(0, 6)

  const stats = [
    { label: 'Total Orders', value: total, icon: ShoppingCart, tone: 'text-amber-200' },
    { label: 'Active Queue', value: pendingOrders, icon: Activity, tone: 'text-teal-200' },
    { label: 'SLA Alerts', value: slaAlerts, icon: AlertTriangle, tone: 'text-rose-200' },
    { label: 'Revenue', value: formatCurrency(recentRevenue), icon: DollarSign, tone: 'text-sky-200' },
  ]

  const quickActions = [
    { href: '/orders/new/trade-in', label: 'Create Trade-In', icon: Plus, description: 'Start a fresh device intake' },
    { href: '/orders/new/cpo', label: 'Create CPO Quote', icon: Package, description: 'Build a resale purchase flow' },
    { href: '/coe/triage', label: 'Open Triage', icon: ClipboardCheck, description: 'Review condition and exceptions' },
    { href: '/coe/shipping', label: 'Check Shipping', icon: Truck, description: 'Finalize outbound operations' },
  ]

  return (
    <div className="relative space-y-8">
      <section className="surface-panel relative overflow-hidden rounded-[2rem] px-6 py-8 sm:px-8 lg:px-10">
        <div className="absolute inset-x-0 top-0 h-px copper-line opacity-80" />
        <div className="grid gap-8 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="space-y-6">
            <div className="space-y-4">
              <span className="eyebrow-label">Command Center</span>
              <div className="space-y-3">
                <h1 className="editorial-title max-w-3xl text-4xl text-stone-100 sm:text-5xl lg:text-6xl">
                  A sharper operating view for every <span className="brand-gradient">device journey</span>.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-stone-400 sm:text-lg">
                  Welcome back, {user?.full_name || 'Operator'}. This workspace surfaces order flow, pricing pressure,
                  SLA risk, and fulfillment movement in one place.
                </p>
              </div>
          </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/orders/new/trade-in">
                <Button size="lg">
                  <Plus className="mr-2 h-4 w-4" />
                  New Trade-In
                </Button>
              </Link>
              <Link href="/orders/new/cpo">
                <Button size="lg" variant="outline">
                  <Package className="mr-2 h-4 w-4" />
                  New CPO
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="metric-tile h-full p-5 transition-transform duration-300 hover:-translate-y-1">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <p className="mb-1 text-base font-semibold text-stone-100">{action.label}</p>
                  <p className="text-sm leading-6 text-stone-400">{action.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">{stat.label}</p>
                <div className="mt-3 text-4xl font-semibold text-stone-50">
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
        <Card className="surface-panel overflow-hidden border-white/8 bg-transparent text-stone-100">
          <CardHeader>
            <CardTitle className="text-2xl text-stone-100">Order Momentum</CardTitle>
            <CardDescription className="text-stone-400">Volume over the last seven days.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] sm:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="momentumFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#d17843" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#d17843" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(18,14,12,0.95)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '18px',
                    color: '#f5f5f4',
                  }}
                />
                <Area type="monotone" dataKey="orders" stroke="#f3d5af" strokeWidth={2.5} fill="url(#momentumFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="surface-panel overflow-hidden border-white/8 bg-transparent text-stone-100">
          <CardHeader>
            <CardTitle className="text-2xl text-stone-100">Pipeline Weight</CardTitle>
            <CardDescription className="text-stone-400">Where operational effort is concentrated now.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] sm:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#a8a29e', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(18,14,12,0.95)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '18px',
                    color: '#f5f5f4',
                  }}
                />
                <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                  {pipelineData.map((entry) => (
                    <Cell key={entry.label} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Card className="surface-panel overflow-hidden border-white/8 bg-transparent text-stone-100">
          <CardHeader className="flex-row items-end justify-between space-y-0">
            <div>
              <CardTitle className="text-2xl text-stone-100">Recent Activity</CardTitle>
              <CardDescription className="mt-2 text-stone-400">Latest orders and where they sit.</CardDescription>
            </div>
            <Link href="/orders" className="text-sm text-primary hover:text-amber-200">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentOrders.length === 0 && (
              <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center text-sm text-stone-500">
                No recent orders yet.
              </div>
            )}
            {recentOrders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-5 py-4 transition hover:bg-white/[0.05]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-stone-100">{order.order_number || 'Untitled Order'}</p>
                      <p className="text-sm text-stone-400">
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
                      <ArrowRight className="h-4 w-4 text-stone-500" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="surface-panel overflow-hidden border-white/8 bg-transparent text-stone-100">
          <CardHeader>
            <CardTitle className="text-2xl text-stone-100">Operational Notes</CardTitle>
            <CardDescription className="text-stone-400">A quick read of today’s posture.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.035] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-stone-500">Queue</p>
              <p className="text-lg font-semibold text-stone-100">{pendingOrders} orders need active handling.</p>
              <p className="mt-2 text-sm leading-6 text-stone-400">
                Submitted, quoted, sourcing, receiving, and triage work are grouped into the active queue so the team can
                prioritize throughput instead of scanning every status manually.
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.035] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-stone-500">Revenue Surface</p>
              <p className="text-lg font-semibold text-stone-100">{formatCurrency(recentRevenue)} in visible order value.</p>
              <p className="mt-2 text-sm leading-6 text-stone-400">
                This is drawn from the currently loaded order set and gives finance and sales a quick directional read on the
                active book of business.
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.035] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-stone-500">SLA Risk</p>
              <p className="text-lg font-semibold text-stone-100">{slaAlerts} breached or at-risk orders flagged.</p>
              <p className="mt-2 text-sm leading-6 text-stone-400">
                Keep an eye on exceptions and triage if this number climbs. It’s usually the earliest signal that the system
                needs operational rebalancing.
              </p>
            </div>
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
  const targetPath = getDefaultAppPathForRole(user?.role)

  useEffect(() => {
    if (!isInitializing && user && !isInternal) {
      router.replace(targetPath)
    }
  }, [isInitializing, isInternal, router, targetPath, user])

  if (isInitializing || !user) {
    return (
      <div className="surface-panel rounded-[1.75rem] px-6 py-12 text-center text-stone-400">
        Loading your workspace...
      </div>
    )
  }

  if (!isInternal) {
    return (
      <div className="surface-panel rounded-[1.75rem] px-6 py-12 text-center text-stone-400">
        Opening your workspace...
      </div>
    )
  }

  return <InternalDashboard user={user} />
}
