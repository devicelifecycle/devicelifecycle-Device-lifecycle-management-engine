// ============================================================================
// ORDERS PAGE
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, ShoppingCart, X, Trash2, ArrowRightLeft, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useOrders } from '@/hooks/useOrders'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import { Pagination } from '@/components/ui/pagination'
import type { OrderStatus, OrderType } from '@/types'

export default function OrdersPage() {
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [typeFilter, setTypeFilter] = useState<OrderType | ''>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<OrderStatus | ''>('')
  const debouncedSearch = useDebounce(search)
  const { hasRole } = useAuth()
  const isAdmin = hasRole(['admin'])
  const isInternal = hasRole(['admin', 'coe_manager', 'coe_tech', 'sales'])
  const isCustomer = hasRole(['customer'])
  const canCreateTradeIn = isInternal || isCustomer
  const canCreateCpo = isInternal
  const canBulkTransition = isInternal

  useEffect(() => {
    const statusFromUrl = searchParams.get('status')
    const typeFromUrl = searchParams.get('type')

    if (statusFromUrl && statusFromUrl in ORDER_STATUS_CONFIG) {
      setStatusFilter(statusFromUrl as OrderStatus)
    }
    if (typeFromUrl === 'trade_in' || typeFromUrl === 'cpo') {
      setTypeFilter(typeFromUrl as OrderType)
    }
  }, [searchParams])

  const { orders, isLoading, total, totalPages, bulkTransition, isBulkTransitioning, bulkDelete, isBulkDeleting } = useOrders({
    search: debouncedSearch,
    page,
    ...(statusFilter && { status: statusFilter }),
    ...(typeFilter && { type: typeFilter }),
  })

  const hasFilters = statusFilter || typeFilter
  const clearFilters = () => { setStatusFilter(''); setTypeFilter(''); setPage(1) }

  const allSelected = orders.length > 0 && orders.every(o => selectedIds.has(o.id))
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(orders.map(o => o.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkTransition = async () => {
    if (!bulkStatus || selectedIds.size === 0) return
    try {
      const result = await bulkTransition({ orderIds: Array.from(selectedIds), toStatus: bulkStatus as OrderStatus })
      toast.success(`${result.succeeded} order(s) updated${result.failed > 0 ? `, ${result.failed} failed` : ''}`)
      setSelectedIds(new Set())
      setBulkStatus('')
    } catch {
      toast.error('Bulk transition failed')
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    try {
      const result = await bulkDelete(Array.from(selectedIds))
      toast.success(`${result.succeeded} order(s) deleted${result.failed > 0 ? `, ${result.failed} failed (only draft/cancelled can be deleted)` : ''}`)
      setSelectedIds(new Set())
    } catch {
      toast.error('Bulk delete failed')
    }
  }

  const handleExportCSV = () => {
    const selected = orders.filter(o => selectedIds.has(o.id))
    const rows = [
      ['Order #', 'Type', 'Customer/Vendor', 'Status', 'Qty', 'Amount', 'Created'].join(','),
      ...selected.map(o =>
        [
          o.order_number,
          o.type === 'trade_in' ? 'Trade-In' : 'CPO',
          `"${(o.type === 'trade_in' ? o.customer?.company_name : o.vendor?.company_name) || ''}"`,
          o.status,
          o.total_quantity,
          o.total_amount || 0,
          o.created_at,
        ].join(',')
      ),
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${selected.length} order(s)`)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground mt-1">
            {isInternal ? 'Manage trade-in and CPO orders' : isCustomer ? 'Track your submitted orders' : 'Track vendor order workflow'}
          </p>
        </div>
        <div className="flex gap-2">
          {canCreateTradeIn && (
            <Link href="/orders/new/trade-in">
              <Button className="shadow-md shadow-primary/20">
                <Plus className="mr-2 h-4 w-4" />
                New Trade-In
              </Button>
            </Link>
          )}
          {canCreateCpo && (
            <Link href="/orders/new/cpo">
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                New CPO
              </Button>
            </Link>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="flex gap-3"
      >
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
      </motion.div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {someSelected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <div className="h-4 w-px bg-border" />

              {/* Bulk Transition */}
              {canBulkTransition && (
                <>
                  <Select value={bulkStatus || 'pick'} onValueChange={v => setBulkStatus(v === 'pick' ? '' : v as OrderStatus)}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue placeholder="Move to..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pick">Move to...</SelectItem>
                      {Object.entries(ORDER_STATUS_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>{config.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={!bulkStatus || isBulkTransitioning}
                    onClick={handleBulkTransition}
                  >
                    <ArrowRightLeft className="mr-1 h-3 w-3" />
                    {isBulkTransitioning ? 'Updating...' : 'Apply'}
                  </Button>

                  <div className="h-4 w-px bg-border" />
                </>
              )}

              {/* Export CSV */}
              <Button size="sm" variant="outline" onClick={handleExportCSV}>
                <Download className="mr-1 h-3 w-3" />
                Export CSV
              </Button>

              {/* Bulk Delete (admin only) */}
              {isAdmin && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isBulkDeleting}
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  {isBulkDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              )}

              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orders List */}
      <motion.div
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
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
                  <div key={i} className="flex items-center gap-4 h-14 px-4 rounded-lg" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="h-4 w-16 rounded skeleton-shimmer" />
                    <div className="h-4 w-14 rounded skeleton-shimmer" />
                    <div className="h-4 w-32 rounded skeleton-shimmer" />
                    <div className="h-4 w-16 rounded skeleton-shimmer" />
                    <div className="h-4 w-12 rounded skeleton-shimmer" />
                    <div className="h-4 w-20 rounded skeleton-shimmer" />
                  </div>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-16">
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground/40" />
                </motion.div>
                <p className="mt-3 text-sm font-medium text-muted-foreground">No orders found</p>
                <p className="mt-1 text-xs text-muted-foreground">{canCreateTradeIn ? 'Create your first order to get started.' : 'Orders will appear here as they are assigned.'}</p>
                {canCreateTradeIn && (
                  <Link href="/orders/new/trade-in">
                    <Button size="sm" className="mt-4">Create Order</Button>
                  </Link>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
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
                    const isSelected = selectedIds.has(order.id)
                    return (
                      <TableRow key={order.id} className={`group ${isSelected ? 'bg-muted/40' : ''}`}>
                        <TableCell>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(order.id)} />
                        </TableCell>
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
      </motion.div>
    </div>
  )
}
