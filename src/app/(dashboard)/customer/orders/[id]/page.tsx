'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, XCircle, Loader2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { useOrder } from '@/hooks/useOrders'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG, CUSTOMER_STATUS_CONFIG } from '@/lib/constants'
import { toast } from 'sonner'
import type { OrderStatus } from '@/types'

export default function CustomerOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = typeof params.id === 'string' ? params.id : null
  const { order, isLoading, refetch } = useOrder(orderId)
  const [transitioning, setTransitioning] = useState(false)

  async function handleQuoteAction(action: 'accepted' | 'rejected') {
    if (!order) return
    setTransitioning(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: action }),
      })
      if (!res.ok) throw new Error('Failed to update quote')
      toast.success(action === 'accepted' ? 'Quote accepted! We will process your order.' : 'Quote declined.')
      refetch?.()
    } catch {
      toast.error('Could not update quote status. Please try again.')
    } finally {
      setTransitioning(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link href="/customer/orders">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />Back to Orders
          </Button>
        </Link>
        <div className="text-center py-20 text-muted-foreground">
          <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Order not found</p>
          <p className="mt-1 text-xs">This order may have been removed or you may not have access to it.</p>
        </div>
      </div>
    )
  }

  const statusCfg = CUSTOMER_STATUS_CONFIG[order.status as OrderStatus] ?? ORDER_STATUS_CONFIG[order.status as OrderStatus]
  const isQuoted = order.status === 'quoted'
  const quotedAmount = order.quoted_amount ?? order.total_amount ?? 0

  function parseItemQty(item: { quantity?: number | null; notes?: string | null }): number {
    const match = item.notes?.match(/\[Original qty:\s*(\d+)\]/i)
    if (match) return parseInt(match[1], 10)
    return item.quantity ?? 1
  }

  function stripInternalNotes(notes: string | null | undefined): string {
    if (!notes) return ''
    return notes.replace(/\[Original qty:\s*\d+\]\s*\|?\s*/gi, '').replace(/^\s*\|\s*/, '').trim()
  }

  const hasAnyPrice = order.items?.some(item =>
    (item.unit_price ?? item.guaranteed_buyback_price) != null
  ) ?? false
  const showPriceCol = isQuoted || hasAnyPrice

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customer/orders">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Order {order.order_number}</h1>
          <p className="text-xs text-muted-foreground">Updated {formatRelativeTime(order.updated_at || order.created_at)}</p>
        </div>
        <Badge variant="secondary" className="ml-auto text-xs">{statusCfg?.label || order.status}</Badge>
      </div>

      {/* Quote Accept Banner */}
      {isQuoted && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/60 dark:border-purple-800 dark:bg-purple-950/20 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold text-purple-900 dark:text-purple-200">Your quote is ready</p>
            <p className="text-sm text-purple-700 dark:text-purple-300 mt-0.5">
              Total: <strong>{formatCurrency(quotedAmount)}</strong> — Please accept or decline below.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="success"
              className="gap-1.5"
              disabled={transitioning}
              onClick={() => handleQuoteAction('accepted')}
            >
              {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Accept Quote
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50/60 hover:border-red-300 hover:text-red-600"
              disabled={transitioning}
              onClick={() => handleQuoteAction('rejected')}
            >
              <XCircle className="h-4 w-4" />
              Decline
            </Button>
          </div>
        </div>
      )}

      {/* Order Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Order Type</p>
            <p className="font-semibold capitalize mt-1">{order.type?.replace(/_/g, ' ') || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total Devices</p>
            <p className="font-semibold mt-1">{order.total_quantity ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{isQuoted ? 'Quoted Amount' : 'Amount'}</p>
            <p className="font-semibold mt-1">{quotedAmount > 0 ? formatCurrency(quotedAmount) : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      {order.items && order.items.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Devices</CardTitle>
            <CardDescription>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    {showPriceCol && <TableHead className="text-right">Unit Price</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => {
                    const device = item.device ? `${item.device.make || ''} ${item.device.model || ''}`.trim() : '—'
                    const unitPrice = item.unit_price ?? item.guaranteed_buyback_price ?? null
                    const displayQty = parseItemQty(item)
                    const itemNote = stripInternalNotes(item.notes)
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <div>{device}</div>
                          {itemNote && <div className="text-xs text-muted-foreground mt-0.5">{itemNote}</div>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.storage || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">
                          {(item.claimed_condition || '—').replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{displayQty}</TableCell>
                        {showPriceCol && (
                          <TableCell className="text-right tabular-nums font-medium">
                            {unitPrice != null ? formatCurrency(unitPrice) : '—'}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {order.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
