'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, ShoppingCart, CheckCircle, XCircle } from 'lucide-react'
import { useOrders } from '@/hooks/useOrders'
import { useDebounce } from '@/hooks/useDebounce'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG, CUSTOMER_STATUS_CONFIG } from '@/lib/constants'
import type { OrderStatus } from '@/types'

export default function CustomerOrdersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [transitioning, setTransitioning] = useState<Record<string, boolean>>({})
  const debouncedSearch = useDebounce(search)

  const { orders, total, totalPages, isLoading, refetch } = useOrders({
    search: debouncedSearch,
    page,
    page_size: 20,
    sort_by: 'updated_at',
    sort_order: 'desc',
  })

  async function handleQuoteAction(orderId: string, action: 'accepted' | 'rejected') {
    setTransitioning(prev => ({ ...prev, [orderId]: true }))
    try {
      await fetch(`/api/orders/${orderId}/transition`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      })
      refetch?.()
    } finally {
      setTransitioning(prev => ({ ...prev, [orderId]: false }))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Orders</h1>
        <p className="text-muted-foreground mt-1">Track quotes and order updates.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search orders, IMEI, or serial..."
          className="pl-10 bg-background"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders</CardTitle>
          <CardDescription>{total} total order{total === 1 ? '' : 's'}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-14">
              <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No orders found</p>
              <p className="mt-1 text-xs text-muted-foreground">Create a new request to start an order.</p>
              <Link href="/customer/requests">
                <Button size="sm" className="mt-4">Create Request</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const status = CUSTOMER_STATUS_CONFIG[order.status as OrderStatus] ?? ORDER_STATUS_CONFIG[order.status as OrderStatus]
                  const isQuoted = order.status === 'quoted'
                  const isBusy = transitioning[order.id]
                  return (
                    <TableRow key={order.id} className={isQuoted ? 'bg-purple-50/40 dark:bg-purple-950/20' : ''}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/orders/${order.id}`} className="font-medium text-primary hover:underline">
                          {order.order_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {order.type === 'trade_in' ? 'Trade-In' : 'CPO'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="secondary" className="text-[11px]">
                          {status?.label || order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium whitespace-nowrap">
                        {formatCurrency(order.quoted_amount ?? order.total_amount ?? 0)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(order.updated_at || order.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {isQuoted && (
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                              disabled={isBusy}
                              onClick={() => handleQuoteAction(order.id, 'accepted')}
                            >
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs text-red-600 border-red-300 hover:bg-red-50"
                              disabled={isBusy}
                              onClick={() => handleQuoteAction(order.id, 'rejected')}
                            >
                              <XCircle className="mr-1 h-3 w-3" />
                              Decline
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  )
}
