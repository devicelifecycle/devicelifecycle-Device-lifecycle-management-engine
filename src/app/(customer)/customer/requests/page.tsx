'use client'

import Link from 'next/link'
import { ArrowRight, FilePlus2, ClipboardList } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useOrders } from '@/hooks/useOrders'
import { formatRelativeTime } from '@/lib/utils'

export default function CustomerRequestsPage() {
  const { orders, isLoading } = useOrders({ page: 1, page_size: 5, type: 'trade_in' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
        <p className="text-muted-foreground mt-1">Create and monitor trade-in requests</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create New Request</CardTitle>
          <CardDescription>Submit devices for trade-in pricing and processing</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/orders/new/trade-in">
            <Button>
              <FilePlus2 className="mr-2 h-4 w-4" />
              New Trade-In Request
            </Button>
          </Link>
          <Link href="/customer/orders">
            <Button variant="outline">
              View My Orders
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Requests</CardTitle>
          <CardDescription>Your latest trade-in requests</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10">
              <ClipboardList className="mx-auto h-9 w-9 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">No requests yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">Updated {formatRelativeTime(order.updated_at || order.created_at)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
