// ============================================================================
// ORDERS PAGE
// ============================================================================

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Search, ShoppingCart, X } from 'lucide-react'
import { useOrders } from '@/hooks/useOrders'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import { Pagination } from '@/components/ui/pagination'
import type { OrderStatus, OrderType } from '@/types'

export default function OrdersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [typeFilter, setTypeFilter] = useState<OrderType | ''>('')
  const debouncedSearch = useDebounce(search)
  const { orders, isLoading, total, totalPages } = useOrders({
    search: debouncedSearch,
    page,
    ...(statusFilter && { status: statusFilter }),
    ...(typeFilter && { type: typeFilter }),
  })

  const hasFilters = statusFilter || typeFilter
  const clearFilters = () => { setStatusFilter(''); setTypeFilter(''); setPage(1) }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground mt-1">
            Manage trade-in and CPO orders
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/orders/new/trade-in">
            <Button className="shadow-md shadow-primary/20">
              <Plus className="mr-2 h-4 w-4" />
              New Trade-In
            </Button>
          </Link>
          <Link href="/orders/new/cpo">
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              New CPO
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by order number, customer, or vendor..." className="pl-10 bg-background" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Select value={statusFilter || 'all'} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v as OrderStatus); setPage(1) }}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(ORDER_STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter || 'all'} onValueChange={v => { setTypeFilter(v === 'all' ? '' : v as OrderType); setPage(1) }}>
          <SelectTrigger className="w-[140px] bg-background">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="trade_in">Trade-In</SelectItem>
            <SelectItem value="cpo">CPO</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="icon" onClick={clearFilters} title="Clear filters">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Orders List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-base">All Orders</CardTitle>
            <CardDescription>{total} total orders</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No orders found</p>
              <p className="mt-1 text-xs text-muted-foreground">Create your first order to get started.</p>
              <Link href="/orders/new/trade-in">
                <Button size="sm" className="mt-4">Create Order</Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer / Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const statusConfig = ORDER_STATUS_CONFIG[order.status]
                  return (
                    <TableRow key={order.id} className="group">
                      <TableCell>
                        <Link 
                          href={`/orders/${order.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {order.order_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {order.type === 'trade_in' ? 'Trade-In' : 'CPO'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {order.type === 'trade_in' 
                            ? order.customer?.company_name 
                            : order.vendor?.company_name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          order.status === 'delivered' || order.status === 'closed' ? 'default' :
                          order.status === 'cancelled' || order.status === 'rejected' ? 'destructive' :
                          'secondary'
                        } className="text-[11px]">
                          {statusConfig?.label || order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{order.total_quantity}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(order.total_amount || 0)}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{formatRelativeTime(order.created_at)}</span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  )
}
