'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRightLeft, Download, Plus, Search, ShoppingCart, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useOrders } from '@/hooks/useOrders'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Pagination } from '@/components/ui/pagination'
import { PageHero } from '@/components/ui/page-hero'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { OrderStatus, OrderType } from '@/types'

export default function OrdersPage() {
  const router = useRouter()
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
  const canCreateCpo = hasRole(['admin', 'coe_manager', 'coe_tech'])
  const canBulkTransition = isInternal

  const customerIdFromUrl = searchParams.get('customer_id') || undefined
  const vendorIdFromUrl = searchParams.get('vendor_id') || undefined

  useEffect(() => {
    if (isCustomer) router.replace('/customer/orders')
  }, [isCustomer, router])

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

  const {
    orders,
    isLoading,
    total,
    totalPages,
    bulkTransition,
    isBulkTransitioning,
    bulkDelete,
    isBulkDeleting,
  } = useOrders({
    search: debouncedSearch,
    page,
    ...(statusFilter && { status: statusFilter }),
    ...(typeFilter && { type: typeFilter }),
    ...(customerIdFromUrl && { customer_id: customerIdFromUrl }),
    ...(vendorIdFromUrl && { vendor_id: vendorIdFromUrl }),
  })

  const hasFilters = statusFilter || typeFilter || customerIdFromUrl || vendorIdFromUrl
  const allSelected = orders.length > 0 && orders.every((order) => selectedIds.has(order.id))
  const someSelected = selectedIds.size > 0
  const deletableSelectedCount = orders.filter((order) => selectedIds.has(order.id) && ['draft', 'cancelled'].includes(order.status)).length

  const stats = useMemo(() => {
    const active = orders.filter((order) => ['submitted', 'quoted', 'sourcing', 'received', 'in_triage'].includes(order.status)).length
    const delivered = orders.filter((order) => ['delivered', 'closed'].includes(order.status)).length
    const totalValue = orders.reduce((sum, order) => sum + (order.quoted_amount ?? order.total_amount ?? 0), 0)
    return { active, delivered, totalValue }
  }, [orders])

  function clearFilters() {
    setStatusFilter('')
    setTypeFilter('')
    setPage(1)
    if (customerIdFromUrl || vendorIdFromUrl) router.replace('/orders')
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(orders.map((order) => order.id)))
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkTransition() {
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

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    const deletableIds = orders
      .filter((order) => selectedIds.has(order.id) && ['draft', 'cancelled'].includes(order.status))
      .map((order) => order.id)
    if (deletableIds.length === 0) {
      toast.error('Only draft or cancelled orders can be deleted.')
      return
    }
    try {
      const result = await bulkDelete(deletableIds)
      const skipped = selectedIds.size - deletableIds.length
      if (result.succeeded > 0) {
        toast.success(`${result.succeeded} order(s) deleted${skipped > 0 ? `, ${skipped} skipped` : ''}`)
      }
      if (result.failed > 0) {
        const firstError = result.results?.find((row) => !row.success && row.error)?.error
        toast.error(`${result.failed} order(s) could not be deleted${firstError ? `: ${firstError}` : ''}`)
      }
      setSelectedIds(new Set())
    } catch {
      toast.error('Bulk delete failed')
    }
  }

  function handleExportCSV() {
    const selected = orders.filter((order) => selectedIds.has(order.id))
    const rows = [
      ['Order #', 'Type', 'Customer/Vendor', 'Status', 'Qty', 'Amount', 'Created'].join(','),
      ...selected.map((order) =>
        [
          order.order_number,
          order.type === 'trade_in' ? 'Trade-In' : 'CPO',
          `"${(order.type === 'trade_in' ? order.customer?.company_name : order.vendor?.company_name) || ''}"`,
          order.status,
          order.total_quantity,
          order.total_amount || 0,
          order.created_at,
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${selected.length} order(s)`)
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Order Operations"
        title="Move trade-in and CPO work through one visible queue."
        description={
          isInternal
            ? 'Search, filter, bulk-transition, and track operational throughput without losing context between teams.'
            : 'Track the orders relevant to your role and keep momentum visible.'
        }
        actions={
          <>
            {canCreateCpo && (
              <Link href="/orders/new">
                <Button variant="secondary">
                  <Upload className="mr-2 h-4 w-4" />
                  CSV / Mixed Order
                </Button>
              </Link>
            )}
            {canCreateTradeIn && (
              <Link href="/orders/new/trade-in">
                <Button>
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
          </>
        }
        stats={[
          { label: 'Visible orders', value: total },
          { label: 'Active queue', value: stats.active },
          { label: 'Closed / delivered', value: stats.delivered },
          { label: 'Visible value', value: formatCurrency(stats.totalValue) },
        ]}
      />

      {organizationIdBanner({
        customerIdFromUrl,
        vendorIdFromUrl,
        clearFilters,
      })}

      <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-2xl text-stone-100">Filters and controls</CardTitle>
              <CardDescription className="mt-2 text-stone-400">
                Search the queue, narrow by status or type, and prepare bulk actions.
              </CardDescription>
            </div>
            {hasFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
              <Input
                placeholder="Search by order number, IMEI, or serial number..."
                className="pl-11"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(value) => { setStatusFilter(value === 'all' ? '' : (value as OrderStatus)); setPage(1) }}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(ORDER_STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter || 'all'} onValueChange={(value) => { setTypeFilter(value === 'all' ? '' : (value as OrderType)); setPage(1) }}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="trade_in">Trade-In</SelectItem>
                <SelectItem value="cpo">CPO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <AnimatePresence>
            {someSelected && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-[1.4rem] border border-white/8 bg-white/[0.04] px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary">{selectedIds.size} selected</Badge>

                  {canBulkTransition && (
                    <>
                      <Select value={bulkStatus || 'pick'} onValueChange={(value) => setBulkStatus(value === 'pick' ? '' : (value as OrderStatus))}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Move to..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pick">Move to...</SelectItem>
                          {Object.entries(ORDER_STATUS_CONFIG).map(([key, config]) => (
                            <SelectItem key={key} value={key}>
                              {config.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" disabled={!bulkStatus || isBulkTransitioning} onClick={handleBulkTransition}>
                        <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                        {isBulkTransitioning ? 'Updating...' : 'Apply'}
                      </Button>
                    </>
                  )}

                  <Button size="sm" variant="outline" onClick={handleExportCSV}>
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Export CSV
                  </Button>

                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isBulkDeleting || deletableSelectedCount === 0}
                      onClick={handleBulkDelete}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      {isBulkDeleting ? 'Deleting...' : 'Delete'}
                    </Button>
                  )}

                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                    Clear selection
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-2xl text-stone-100">Order index</CardTitle>
            <CardDescription className="mt-2 text-stone-400">{total} total orders in the current view.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-16 rounded-[1rem] bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.025] px-6 py-16 text-center">
              <ShoppingCart className="mx-auto h-10 w-10 text-stone-600" />
              <p className="mt-4 text-lg font-semibold text-stone-200">No orders match this view.</p>
              <p className="mt-2 text-sm text-stone-500">
                {canCreateTradeIn ? 'Create an order or relax the filters to bring the queue back into view.' : 'Orders will appear here when work is assigned.'}
              </p>
              {canCreateTradeIn && (
                <Link href="/orders/new/trade-in">
                  <Button className="mt-5">Create order</Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Order</TableHead>
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
                      <TableRow key={order.id} data-state={isSelected ? 'selected' : undefined}>
                        <TableCell>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(order.id)} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Link href={`/orders/${order.id}`} className="font-medium text-primary hover:underline">
                              {order.order_number}
                            </Link>
                            {(order.unresolved_discrepancy_count || 0) > 0 && (
                              <Badge variant="destructive" className="h-5 px-2 text-[10px] uppercase tracking-wide">
                                {order.unresolved_discrepancy_count} exception{order.unresolved_discrepancy_count === 1 ? '' : 's'}
                              </Badge>
                            )}
                            {(order.unresolved_discrepancy_count || 0) === 0 && (order.discrepancy_count || 0) > 0 && (
                              <Badge variant="secondary" className="h-5 px-2 text-[10px] uppercase tracking-wide">
                                resolved
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{order.type === 'trade_in' ? 'Trade-In' : 'CPO'}</Badge>
                        </TableCell>
                        <TableCell className="text-stone-300 whitespace-nowrap">
                          {order.type === 'trade_in' ? order.customer?.company_name : order.vendor?.company_name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge status={order.status} label={statusConfig?.label} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{order.total_quantity}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium whitespace-nowrap">
                          {formatCurrency(order.total_amount || 0)}
                        </TableCell>
                        <TableCell className="text-stone-400 whitespace-nowrap">{formatRelativeTime(order.created_at)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function organizationIdBanner({
  customerIdFromUrl,
  vendorIdFromUrl,
  clearFilters,
}: {
  customerIdFromUrl?: string
  vendorIdFromUrl?: string
  clearFilters: () => void
}) {
  if (!customerIdFromUrl && !vendorIdFromUrl) return null

  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.04] px-5 py-4 text-sm text-stone-300">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-stone-500">Scoped view active.</span>
        {customerIdFromUrl ? <span>Showing orders for a selected customer.</span> : null}
        {vendorIdFromUrl ? <span>Showing orders for a selected vendor.</span> : null}
        <button className="ml-auto text-primary hover:text-amber-200" onClick={clearFilters}>
          Clear scope
        </button>
      </div>
    </div>
  )
}
