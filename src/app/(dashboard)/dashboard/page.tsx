// ============================================================================
// DASHBOARD HOME PAGE
// ============================================================================

'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ShoppingCart, Users, AlertTriangle, TrendingUp, Plus, ArrowRight, DollarSign, Package, Clock, Activity } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import { AnimatedCounter } from '@/components/ui/motion'

// Generate last 7 days trend data from orders
function useOrderTrend(orders: { created_at: string }[]) {
  return useMemo(() => {
    const days: { date: string; label: string; orders: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-US', { weekday: 'short' })
      const count = orders.filter(o => o.created_at?.slice(0, 10) === dateStr).length
      days.push({ date: dateStr, label, orders: count })
    }
    return days
  }, [orders])
}

// Generate pipeline data from orders
function useOrderPipeline(orders: { status: string }[]) {
  return useMemo(() => {
    const statusOrder = ['draft', 'submitted', 'quoted', 'accepted', 'sourcing', 'shipped_to_coe', 'received', 'triaging', 'ready_to_ship', 'shipped', 'delivered', 'closed']
    const counts: Record<string, number> = {}
    orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1 })
    return statusOrder
      .filter(s => counts[s])
      .map(s => ({
        status: (ORDER_STATUS_CONFIG as Record<string, { label: string }>)[s]?.label || s,
        count: counts[s] || 0,
        fill: STATUS_COLORS[s] || '#94a3b8',
      }))
  }, [orders])
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  submitted: '#3b82f6',
  quoted: '#8b5cf6',
  accepted: '#14b8a6',
  sourcing: '#f59e0b',
  shipped_to_coe: '#6366f1',
  received: '#06b6d4',
  triaging: '#ec4899',
  ready_to_ship: '#10b981',
  shipped: '#0ea5e9',
  delivered: '#22c55e',
  closed: '#64748b',
  cancelled: '#ef4444',
  rejected: '#f43f5e',
}

export default function DashboardPage() {
  const { user, hasRole } = useAuth()
  const { orders, total, isLoading } = useOrders({ page_size: 50 })

  const isInternal = hasRole(['admin', 'coe_manager', 'coe_tech', 'sales'])

  const pendingOrders = orders.filter(o => ['submitted', 'quoted', 'sourcing'].includes(o.status)).length
  const breachedOrders = orders.filter(o => o.is_sla_breached).length
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

  const trendData = useOrderTrend(orders)
  const pipelineData = useOrderPipeline(orders)
  const recentOrders = orders.slice(0, 5)

  const statCards = [
    {
      title: isInternal ? 'Total Orders' : 'My Orders',
      value: total,
      description: isInternal ? 'All time orders' : 'Your orders',
      icon: ShoppingCart,
      iconBg: 'bg-teal-500/12',
      iconColor: 'text-teal-600 dark:text-teal-400',
      gradient: 'from-teal-500/5 to-emerald-500/5',
    },
    {
      title: 'Pending',
      value: pendingOrders,
      description: 'Awaiting action',
      icon: Clock,
      iconBg: 'bg-amber-500/12',
      iconColor: 'text-amber-600 dark:text-amber-400',
      gradient: 'from-amber-500/5 to-orange-500/5',
    },
    ...(isInternal ? [
      {
        title: 'SLA Alerts',
        value: breachedOrders,
        description: 'Orders breaching SLA',
        icon: AlertTriangle,
        iconBg: breachedOrders > 0 ? 'bg-red-500/12' : 'bg-emerald-500/12',
        iconColor: breachedOrders > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
        gradient: breachedOrders > 0 ? 'from-red-500/5 to-rose-500/5' : 'from-emerald-500/5 to-teal-500/5',
      },
      {
        title: 'Revenue',
        value: formatCurrency(totalRevenue),
        description: 'From recent orders',
        icon: DollarSign,
        iconBg: 'bg-emerald-500/12',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        gradient: 'from-emerald-500/5 to-teal-500/5',
      },
    ] : []),
  ]

  const staggerClasses = ['animate-stagger-1', 'animate-stagger-2', 'animate-stagger-3', 'animate-stagger-4']

  const displayValue = (stat: (typeof statCards)[0]) => {
    if (typeof stat.value === 'number') return <AnimatedCounter value={stat.value} />
    return stat.value
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      {/* Page Header */}
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-heading">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {user?.full_name || 'User'}. Here&apos;s what&apos;s happening today.
          </p>
        </div>
        {isInternal && (
          <div className="flex gap-3">
            <Link href="/orders/new/trade-in">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button className="shadow-lg shadow-primary/25 btn-glow">
                  <Plus className="mr-2 h-4 w-4" />New Trade-In
                </Button>
              </motion.div>
            </Link>
            <Link href="/orders/new/cpo">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button variant="outline" className="border-2 hover:bg-muted/50">
                  <Plus className="mr-2 h-4 w-4" />New CPO
                </Button>
              </motion.div>
            </Link>
          </div>
        )}
      </motion.div>

      {/* Stats Cards */}
      <div className={`grid gap-5 md:grid-cols-2 ${isInternal ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            whileHover={{ y: -4, scale: 1.02 }}
            className="group"
          >
            <Card className={`relative overflow-hidden border border-transparent bg-card/80 dark:bg-card/60 backdrop-blur-sm bg-gradient-to-br ${stat.gradient} transition-all duration-300 card-hover-lift card-glow animate-gradient-border`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold tracking-tight font-heading">{displayValue(stat)}</p>
                    <p className="text-xs text-muted-foreground">{stat.description}</p>
                  </div>
                  <motion.div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stat.iconBg} ring-1 ring-black/5`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    animate={i === 0 ? { y: [0, -2, 0] } : undefined}
                    transition={i === 0 ? { duration: 3, repeat: Infinity, ease: 'easeInOut' } : undefined}
                  >
                    <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Row (internal only) */}
      {isInternal && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Order Trend */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ y: -2 }}
          >
            <Card className="border border-white/5 dark:border-white/5 bg-card/80 dark:bg-card/60 backdrop-blur-sm shadow-lg shadow-black/5 card-hover-lift card-glow animate-shine">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 font-heading">
                <TrendingUp className="h-4 w-4 text-teal-500" />
                Order Trend (7 days)
              </CardTitle>
              <CardDescription>New orders created per day</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[200px] rounded-lg bg-muted/50 animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tealGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 91% / 0.5)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(224 30% 10%)',
                        border: '1px solid hsl(220 25% 20%)',
                        borderRadius: '8px',
                        color: '#e2e8f0',
                        fontSize: '13px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="orders"
                      stroke="#14b8a6"
                      strokeWidth={2}
                      fill="url(#tealGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
            </Card>
          </motion.div>

          {/* Order Pipeline */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 }}
            whileHover={{ y: -2 }}
          >
            <Card className="border border-white/5 dark:border-white/5 bg-card/80 dark:bg-card/60 backdrop-blur-sm shadow-lg shadow-black/5 card-hover-lift card-glow animate-shine">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 font-heading">
                <Activity className="h-4 w-4 text-violet-500" />
                Order Pipeline
              </CardTitle>
              <CardDescription>Orders by current status</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[200px] rounded-lg bg-muted/50 animate-pulse" />
              ) : pipelineData.length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                  No orders to display
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={pipelineData} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 91% / 0.5)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} stroke="#94a3b8" width={90} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(224 30% 10%)',
                        border: '1px solid hsl(220 25% 20%)',
                        borderRadius: '8px',
                        color: '#e2e8f0',
                        fontSize: '13px',
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                      {pipelineData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Quick Actions + Recent Orders + Activity Feed */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid gap-6 lg:grid-cols-3"
      >
        {/* Quick Actions */}
        <Card className="lg:col-span-1 border border-white/5 dark:border-white/5 bg-card/80 dark:bg-card/60 backdrop-blur-sm shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-base font-heading">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/orders">
              <motion.div whileHover={{ x: 4 }} className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/20 group cursor-pointer">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/12 group-hover:bg-teal-500/20 transition-colors">
                <ShoppingCart className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium">{isInternal ? 'View All Orders' : 'My Orders'}</p>
                <p className="text-xs text-muted-foreground">{isInternal ? 'Manage trade-in & CPO orders' : 'View your order history'}</p>
              </div>
              </motion.div>
            </Link>
            {isInternal && (
              <>
                <Link href="/orders/new/trade-in">
                  <motion.div whileHover={{ x: 4 }} className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/20 group cursor-pointer">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/12 group-hover:bg-violet-500/20 transition-colors">
                    <Package className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">New Order</p>
                    <p className="text-xs text-muted-foreground">Create trade-in or CPO order</p>
                  </div>
                  </motion.div>
                </Link>
                {hasRole(['admin', 'coe_manager', 'sales']) && (
                  <Link href="/customers/new">
                    <motion.div whileHover={{ x: 4 }} className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/20 group cursor-pointer">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12 group-hover:bg-emerald-500/20 transition-colors">
                      <Users className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Add Customer</p>
                    <p className="text-xs text-muted-foreground">Register new customer</p>
                  </div>
                    </motion.div>
                  </Link>
                )}
                {hasRole(['admin', 'coe_manager', 'sales']) && (
                  <Link href="/vendors/new">
                    <motion.div whileHover={{ x: 4 }} className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/20 group cursor-pointer">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/12 group-hover:bg-orange-500/20 transition-colors">
                      <TrendingUp className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Add Vendor</p>
                    <p className="text-xs text-muted-foreground">Register new vendor</p>
                  </div>
                    </motion.div>
                  </Link>
                )}
              </>
            )}
            {!isInternal && (
              <Link href="/notifications">
                <motion.div whileHover={{ x: 4 }} className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/20 group cursor-pointer">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/12 group-hover:bg-amber-500/20 transition-colors">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Notifications</p>
                  <p className="text-xs text-muted-foreground">View updates and alerts</p>
                </div>
                </motion.div>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="lg:col-span-2 border border-white/5 dark:border-white/5 bg-card/80 dark:bg-card/60 backdrop-blur-sm shadow-lg shadow-black/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-heading">Recent Orders</CardTitle>
              <CardDescription>Latest order activity</CardDescription>
            </div>
            <Link href="/orders">
              <Button variant="ghost" size="sm" className="text-xs">
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
                ))}
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">No orders yet.</p>
                <Link href="/orders/new/trade-in">
                  <Button size="sm" className="mt-4">Create First Order</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentOrders.map((order) => {
                  const statusConfig = ORDER_STATUS_CONFIG[order.status]
                  return (
                    <Link key={order.id} href={`/orders/${order.id}`}>
                      <motion.div
                        whileHover={{ x: 4, backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                        className="flex items-center justify-between rounded-xl border p-3.5 transition-colors hover:border-primary/10 group"
                      >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                          {order.type === 'trade_in' ? 'TI' : 'CPO'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm group-hover:text-primary transition-colors">{order.order_number}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {order.customer?.company_name || 'Unknown'} · {formatRelativeTime(order.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-semibold">{formatCurrency(order.total_amount || 0)}</span>
                        <Badge variant={
                          order.status === 'delivered' || order.status === 'closed' ? 'default' :
                          order.status === 'cancelled' || order.status === 'rejected' ? 'destructive' :
                          'secondary'
                        } className="text-[11px]">
                          {statusConfig?.label || order.status}
                        </Badge>
                      </div>
                      </motion.div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Activity Feed (internal only) */}
      {isInternal && recentOrders.length > 0 && (
        <Card className="border border-white/5 dark:border-white/5 bg-card/80 dark:bg-card/60 backdrop-blur-sm shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 font-heading">
              <Activity className="h-4 w-4 text-emerald-500" />
              Activity Feed
            </CardTitle>
            <CardDescription>Recent order timeline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {/* Timeline line */}
              <motion.div
                className="absolute left-[11px] top-2 bottom-2 w-px bg-border origin-top"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
              />
              <div className="space-y-4">
                {recentOrders.map((order, idx) => {
                  const statusConfig = ORDER_STATUS_CONFIG[order.status]
                  const color = STATUS_COLORS[order.status] || '#94a3b8'
                  return (
                    <motion.div
                      key={order.id}
                      className="flex items-start gap-4 relative"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + idx * 0.1 }}
                    >
                      {/* Timeline dot */}
                      <motion.div
                        className="relative z-10 mt-1 h-[10px] w-[10px] rounded-full ring-2 ring-background flex-shrink-0"
                        style={{ backgroundColor: color }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.7 + idx * 0.1, type: 'spring', stiffness: 400, damping: 15 }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/orders/${order.id}`} className="text-sm font-medium hover:text-primary transition-colors">
                            {order.order_number}
                          </Link>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: color, color }}>
                            {statusConfig?.label || order.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {order.customer?.company_name || 'Unknown'} · {order.type === 'trade_in' ? 'Trade-In' : 'CPO'} · {formatRelativeTime(order.created_at)}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatCurrency(order.total_amount || 0)}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
