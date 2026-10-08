'use client'

// ============================================================================
// CUSTOMER DASHBOARD — overview page with key metrics and quick actions
// ============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Box, ClipboardList, FileText, HardDrive, Loader2,
  Package, ShoppingCart, TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import type { OrderStatus } from '@/types'

interface DashboardData {
  orders: { total: number; active: number }
  tradeInValue: number
  assets: { total: number; registered: number; assigned: number; retired: number }
}

interface RecentOrder {
  id: string
  order_number: string
  type: string
  status: OrderStatus
  total_amount: number | null
  created_at: string
}

const EMPTY: DashboardData = {
  orders: { total: 0, active: 0 },
  tradeInValue: 0,
  assets: { total: 0, registered: 0, assigned: 0, retired: 0 },
}

export default function CustomerDashboardPage() {
  const [stats, setStats] = useState<DashboardData>(EMPTY)
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, ordersRes] = await Promise.all([
          fetch('/api/customers/me/reports'),
          fetch('/api/orders?limit=5&sort=created_at&order=desc'),
        ])
        if (statsRes.ok) {
          const json = await statsRes.json()
          setStats(json.data ?? EMPTY)
        }
        if (ordersRes.ok) {
          const json = await ordersRes.json()
          setRecentOrders(json.data ?? [])
        }
      } catch {
        toast.error('Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your orders, assets, and trade-in activity.
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.orders.total}</p>
            <p className="text-xs text-muted-foreground">{stats.orders.active} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Trade-In Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(stats.tradeInValue)}</p>
            <p className="text-xs text-muted-foreground">Quoted total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Devices Registered</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.assets.total}</p>
            <p className="text-xs text-muted-foreground">
              {stats.assets.assigned} assigned, {stats.assets.retired} retired
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Asset Status</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">
                {stats.assets.registered} reg
              </Badge>
              <Badge variant="outline" className="text-xs">
                {stats.assets.assigned} asgn
              </Badge>
              <Badge variant="outline" className="text-xs">
                {stats.assets.retired} ret
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/customer/requests">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center gap-3 pt-6">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">New Order</p>
                <p className="text-xs text-muted-foreground">Submit a trade-in or CPO request</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/customer/assets">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center gap-3 pt-6">
              <HardDrive className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Device Register</p>
                <p className="text-xs text-muted-foreground">Manage your device inventory</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/customer/reports">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center gap-3 pt-6">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Reports</p>
                <p className="text-xs text-muted-foreground">View analytics and exports</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Recent Orders
          </CardTitle>
          <CardDescription>Your latest order activity</CardDescription>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No orders yet.</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => {
                const cfg = ORDER_STATUS_CONFIG[order.status]
                return (
                  <Link
                    key={order.id}
                    href={`/customer/orders/${order.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-sm">{order.order_number}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {order.type.replace(/_/g, ' ')} · {formatDate(order.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {order.total_amount != null && (
                        <span className="text-sm font-medium tabular-nums">
                          {formatCurrency(order.total_amount)}
                        </span>
                      )}
                      <Badge className={cfg?.bgColor ?? 'bg-muted text-muted-foreground'}>
                        {cfg?.label ?? order.status}
                      </Badge>
                    </div>
                  </Link>
                )
              })}
              <div className="pt-2 text-center">
                <Link href="/customer/orders">
                  <Button variant="ghost" size="sm">
                    View all orders <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
