// ============================================================================
// DASHBOARD HOME PAGE
// ============================================================================

'use client'

import Link from 'next/link'
import { ShoppingCart, Users, AlertTriangle, TrendingUp, Plus, ArrowRight, DollarSign, Package, Clock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useOrders } from '@/hooks/useOrders'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'

export default function DashboardPage() {
  const { user, hasRole } = useAuth()
  const { orders, total, isLoading } = useOrders({ page_size: 5 })

  const isInternal = hasRole(['admin', 'coe_manager', 'coe_tech', 'sales'])

  const pendingOrders = orders.filter(o => ['submitted', 'quoted', 'sourcing'].includes(o.status)).length
  const breachedOrders = orders.filter(o => o.is_sla_breached).length
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

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

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {user?.full_name || 'User'}. Here&apos;s what&apos;s happening today.
          </p>
        </div>
        {isInternal && (
          <div className="flex gap-3">
            <Link href="/orders/new/trade-in">
              <Button className="shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-shadow">
                <Plus className="mr-2 h-4 w-4" />New Trade-In
              </Button>
            </Link>
            <Link href="/orders/new/cpo">
              <Button variant="outline" className="border-2 hover:bg-muted/50">
                <Plus className="mr-2 h-4 w-4" />New CPO
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className={`grid gap-5 md:grid-cols-2 ${isInternal ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
        {statCards.map((stat) => (
          <Card key={stat.title} className={`relative overflow-hidden border-0 shadow-lg shadow-black/5 bg-gradient-to-br ${stat.gradient} hover:shadow-xl hover:shadow-black/5 transition-all duration-300`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.description}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${stat.iconBg} ring-1 ring-black/5`}>
                  <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions + Recent Orders */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <Card className="lg:col-span-1 border-0 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/orders" className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/20 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/12 group-hover:bg-teal-500/20 transition-colors">
                <ShoppingCart className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm font-medium">{isInternal ? 'View All Orders' : 'My Orders'}</p>
                <p className="text-xs text-muted-foreground">{isInternal ? 'Manage trade-in & CPO orders' : 'View your order history'}</p>
              </div>
            </Link>
            {isInternal && (
              <>
                <Link href="/orders/new/trade-in" className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/20 group">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/12 group-hover:bg-violet-500/20 transition-colors">
                    <Package className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">New Order</p>
                    <p className="text-xs text-muted-foreground">Create trade-in or CPO order</p>
                  </div>
                </Link>
                {hasRole(['admin', 'coe_manager', 'sales']) && (
                  <Link href="/customers/new" className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/20 group">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12 group-hover:bg-emerald-500/20 transition-colors">
                      <Users className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Add Customer</p>
                      <p className="text-xs text-muted-foreground">Register new customer</p>
                    </div>
                  </Link>
                )}
                {hasRole(['admin', 'coe_manager', 'sales']) && (
                  <Link href="/vendors/new" className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/20 group">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/12 group-hover:bg-orange-500/20 transition-colors">
                      <TrendingUp className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Add Vendor</p>
                      <p className="text-xs text-muted-foreground">Register new vendor</p>
                    </div>
                  </Link>
                )}
              </>
            )}
            {!isInternal && (
            <Link href="/notifications" className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/20 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/12 group-hover:bg-amber-500/20 transition-colors">
                <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Notifications</p>
                  <p className="text-xs text-muted-foreground">View updates and alerts</p>
                </div>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="lg:col-span-2 border-0 shadow-lg shadow-black/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Orders</CardTitle>
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
            ) : orders.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">No orders yet.</p>
                <Link href="/orders/new/trade-in">
                  <Button size="sm" className="mt-4">Create First Order</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {orders.map((order) => {
                  const statusConfig = ORDER_STATUS_CONFIG[order.status]
                  return (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="flex items-center justify-between rounded-xl border p-3.5 transition-all hover:bg-muted/50 hover:shadow-md hover:border-primary/10 group"
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
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
