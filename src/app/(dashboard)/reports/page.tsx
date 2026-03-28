// ============================================================================
// REPORTS PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { BarChart3, ShoppingCart, DollarSign, Truck, AlertTriangle, TrendingUp, Clock, CheckCircle2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'

interface OrderStats {
  total: number
  byStatus: Record<string, number>
  byType: { trade_in: number; cpo: number }
  totalRevenue: number
  avgOrderValue: number
}

interface ShippingStats {
  total_shipments: number
  inbound: number
  outbound: number
  delivered: number
  in_transit: number
  exceptions: number
  average_delivery_days: number
}

export default function ReportsPage() {
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null)
  const [shippingStats, setShippingStats] = useState<ShippingStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    setIsLoading(true)
    try {
      const [ordersRes, shippingRes] = await Promise.all([
        fetch('/api/orders?page_size=500'),
        fetch('/api/shipments/stats'),
      ])

      if (ordersRes.ok) {
        const data = await ordersRes.json()
        const orders = data.data || []
        const byStatus: Record<string, number> = {}
        let tradeIn = 0, cpo = 0, revenue = 0

        orders.forEach((o: { status: string; type: string; total_amount?: number }) => {
          byStatus[o.status] = (byStatus[o.status] || 0) + 1
          if (o.type === 'trade_in') tradeIn++
          else cpo++
          revenue += o.total_amount || 0
        })

        setOrderStats({
          total: data.total || orders.length,
          byStatus,
          byType: { trade_in: tradeIn, cpo },
          totalRevenue: revenue,
          avgOrderValue: orders.length > 0 ? revenue / orders.length : 0,
        })
      }

      if (shippingRes.ok) {
        const data = await shippingRes.json()
        setShippingStats(data)
      }
    } catch {} finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Reports</h1><p className="text-muted-foreground">Analytics and performance metrics</p></div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl skeleton-3d" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-64 rounded-xl skeleton-3d" />)}
        </div>
      </div>
    )
  }

  const topStatCards = [
    {
      title: 'Total Orders',
      value: orderStats?.total || 0,
      icon: ShoppingCart,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600',
    },
    {
      title: 'Total Revenue',
      value: formatCurrency(orderStats?.totalRevenue || 0),
      icon: DollarSign,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Avg. Order Value',
      value: formatCurrency(orderStats?.avgOrderValue || 0),
      icon: TrendingUp,
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-600',
    },
    {
      title: 'Total Shipments',
      value: shippingStats?.total_shipments || 0,
      icon: Truck,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Analytics and performance metrics</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/orders">
            <Button variant="outline" size="sm">Open Orders Workspace</Button>
          </Link>
          <Link href="/coe/receiving">
            <Button variant="outline" size="sm">Open Receiving</Button>
          </Link>
          <Link href="/coe/shipping">
            <Button variant="outline" size="sm">Open Shipping</Button>
          </Link>
          <Link href="/coe/exceptions">
            <Button variant="outline" size="sm">Open Exceptions</Button>
          </Link>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {topStatCards.map(stat => (
          <Card key={stat.title} className="relative overflow-hidden holographic card-3d">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold tracking-tight stat-3d">{stat.value}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.iconBg}`}>
                  <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Orders by Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders by Status</CardTitle>
            <CardDescription>Distribution across the workflow</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {orderStats?.byStatus && Object.entries(orderStats.byStatus)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => {
                  const config = ORDER_STATUS_CONFIG[status as keyof typeof ORDER_STATUS_CONFIG]
                  const pct = orderStats.total > 0 ? (count / orderStats.total) * 100 : 0
                  return (
                    <Link key={status} href={`/orders?status=${status}`} className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-muted/40">
                      <span className={`w-24 text-xs font-medium ${config?.color || ''}`}>
                        {config?.label || status}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${config?.bgColor || 'bg-gray-300'}`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </Link>
                  )
                })
              }
              {(!orderStats?.byStatus || Object.keys(orderStats.byStatus).length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-8">No order data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Orders by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders by Type</CardTitle>
            <CardDescription>Trade-In vs CPO breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border p-6 text-center">
                <p className="text-3xl font-bold text-blue-600">{orderStats?.byType.trade_in || 0}</p>
                <p className="text-sm text-muted-foreground mt-1">Trade-In Orders</p>
                <p className="text-xs text-muted-foreground mt-0.5">Devices bought from customers</p>
              </div>
              <div className="rounded-xl border p-6 text-center">
                <p className="text-3xl font-bold text-purple-600">{orderStats?.byType.cpo || 0}</p>
                <p className="text-sm text-muted-foreground mt-1">CPO Orders</p>
                <p className="text-xs text-muted-foreground mt-0.5">Certified devices sold to customers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shipping Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shipping Overview</CardTitle>
            <CardDescription>Shipment volume and performance</CardDescription>
          </CardHeader>
          <CardContent>
            {shippingStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{shippingStats.inbound}</p>
                    <p className="text-xs text-muted-foreground">Inbound</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{shippingStats.outbound}</p>
                    <p className="text-xs text-muted-foreground">Outbound</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{shippingStats.delivered}</p>
                    <p className="text-xs text-muted-foreground">Delivered</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span className="text-sm">In Transit</span>
                  </div>
                  <Badge variant="secondary">{shippingStats.in_transit}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span className="text-sm">Exceptions</span>
                  </div>
                  <Badge variant={shippingStats.exceptions > 0 ? 'destructive' : 'secondary'}>{shippingStats.exceptions}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">Avg. Delivery Time</span>
                  </div>
                  <span className="text-sm font-medium">{shippingStats.average_delivery_days} days</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No shipping data available</p>
            )}
          </CardContent>
        </Card>

        {/* SLA Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Insights</CardTitle>
            <CardDescription>Key performance indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Active Orders</span>
                <span className="text-sm font-bold">
                  {orderStats?.byStatus
                    ? Object.entries(orderStats.byStatus)
                        .filter(([s]) => !['closed', 'cancelled', 'rejected', 'delivered'].includes(s))
                        .reduce((sum, [, c]) => sum + c, 0)
                    : 0}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Completion Rate</span>
                <span className="text-sm font-bold">
                  {orderStats?.total
                    ? `${Math.round(((orderStats.byStatus['closed'] || 0) + (orderStats.byStatus['delivered'] || 0)) / orderStats.total * 100)}%`
                    : '0%'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Cancellation Rate</span>
                <span className="text-sm font-bold">
                  {orderStats?.total
                    ? `${Math.round(((orderStats.byStatus['cancelled'] || 0)) / orderStats.total * 100)}%`
                    : '0%'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Rejection Rate</span>
                <span className="text-sm font-bold">
                  {orderStats?.total
                    ? `${Math.round(((orderStats.byStatus['rejected'] || 0)) / orderStats.total * 100)}%`
                    : '0%'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
