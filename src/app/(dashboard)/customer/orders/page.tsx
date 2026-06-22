'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, ShoppingCart, CheckCircle, XCircle, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useOrders } from '@/hooks/useOrders'
import { useDebounce } from '@/hooks/useDebounce'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Pagination } from '@/components/ui/pagination'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG, CUSTOMER_STATUS_CONFIG } from '@/lib/constants'
import type { OrderStatus } from '@/types'

export default function CustomerOrdersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [transitioning, setTransitioning] = useState<Record<string, boolean>>({})
  const [downloadingFile, setDownloadingFile] = useState<Record<string, boolean>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)
  const debouncedSearch = useDebounce(search)

  const { orders, total, totalPages, isLoading, refetch } = useOrders({
    search: debouncedSearch,
    page,
    page_size: 20,
    sort_by: 'updated_at',
    sort_order: 'desc',
  })

  async function handleDownloadSourceFile(orderId: string) {
    setDownloadingFile(prev => ({ ...prev, [orderId]: true }))
    try {
      const res = await fetch(`/api/uploads/order-file?order_id=${orderId}`)
      if (!res.ok) { toast.error('Could not get download link.'); return }
      const { signed_url, file_name } = await res.json()
      const a = document.createElement('a')
      a.href = signed_url; a.download = file_name || 'order-file'; a.click()
    } catch {
      toast.error('Download failed. Please try again.')
    } finally {
      setDownloadingFile(prev => ({ ...prev, [orderId]: false }))
    }
  }

  async function handleQuoteAction(orderId: string, action: 'accepted' | 'rejected') {
    setTransitioning(prev => ({ ...prev, [orderId]: true }))
    try {
      const res = await fetch(`/api/orders/${orderId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: action }),
      })
      if (!res.ok) throw new Error('Failed')
      if (action === 'accepted') {
        toast.success('Quote accepted! Review your shipping instructions.')
        router.push(`/customer/orders/${orderId}`)
        return
      }
      toast.success('Quote declined.')
      refetch?.()
    } catch {
      toast.error('Could not update quote status. Please try again.')
    } finally {
      setTransitioning(prev => ({ ...prev, [orderId]: false }))
    }
  }

  const quotedOrders = orders.filter((order) => order.status === 'quoted')
  const allQuotedSelected = quotedOrders.length > 0 && quotedOrders.every((order) => selectedIds.has(order.id))

  function toggleAllQuoted() {
    setSelectedIds(allQuotedSelected ? new Set() : new Set(quotedOrders.map((order) => order.id)))
  }

  function toggleOne(orderId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  async function handleBulkQuoteAction(action: 'accepted' | 'rejected') {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkActing(true)
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/orders/${id}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to_status: action }),
          }).then((res) => {
            if (!res.ok) throw new Error('Failed')
          })
        )
      )
      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.length - succeeded
      if (succeeded > 0) {
        toast.success(
          `${succeeded} quote${succeeded === 1 ? '' : 's'} ${action === 'accepted' ? 'accepted' : 'declined'}${failed > 0 ? `, ${failed} failed` : ''}`
        )
      } else if (failed > 0) {
        toast.error(`Could not update ${failed} quote${failed === 1 ? '' : 's'}. Please try again.`)
      }
      setSelectedIds(new Set())
      refetch?.()
    } finally {
      setBulkActing(false)
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

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <Badge variant="secondary">{selectedIds.size} selected</Badge>
          <Button
            size="sm"
            variant="success"
            disabled={bulkActing}
            onClick={() => handleBulkQuoteAction('accepted')}
          >
            <CheckCircle className="mr-2 h-3.5 w-3.5" />
            Accept Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-500 border-red-200 bg-background/70 hover:bg-red-50/60 hover:border-red-300 hover:text-red-600"
            disabled={bulkActing}
            onClick={() => handleBulkQuoteAction('rejected')}
          >
            <XCircle className="mr-2 h-3.5 w-3.5" />
            Decline Selected
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

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
                  <TableHead className="w-10">
                    {quotedOrders.length > 0 && (
                      <Checkbox checked={allQuotedSelected} onCheckedChange={toggleAllQuoted} />
                    )}
                  </TableHead>
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
                  const hasSourceFile = !!(order.metadata?.source_file_path)
                  return (
                    <TableRow key={order.id} className={isQuoted ? 'bg-purple-50/40 dark:bg-purple-950/20' : ''}>
                      <TableCell>
                        {isQuoted && (
                          <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleOne(order.id)} />
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/customer/orders/${order.id}`} className="font-medium text-primary hover:underline">
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
                        <div className="flex items-center gap-2 justify-end">
                          {hasSourceFile && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              disabled={downloadingFile[order.id]}
                              onClick={() => handleDownloadSourceFile(order.id)}
                              title="Download original uploaded file"
                            >
                              {downloadingFile[order.id]
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Download className="h-3 w-3" />}
                            </Button>
                          )}
                          {isQuoted && (
                            <>
                              <Button
                                size="sm"
                                variant="success"
                                className="h-7 px-2 text-xs"
                                disabled={isBusy}
                                onClick={() => handleQuoteAction(order.id, 'accepted')}
                              >
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-red-500 border-red-200 bg-background/70 hover:bg-red-50/60 hover:border-red-300 hover:text-red-600"
                                disabled={isBusy}
                                onClick={() => handleQuoteAction(order.id, 'rejected')}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                Decline
                              </Button>
                            </>
                          )}
                        </div>
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
