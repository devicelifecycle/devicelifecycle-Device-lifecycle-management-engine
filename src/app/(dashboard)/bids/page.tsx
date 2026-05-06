'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Gavel, CheckCircle, XCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { useBids, type BidWithContext } from '@/hooks/useBids'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { PageHero } from '@/components/ui/page-hero'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All bids' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
]

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  accepted: 'default',
  rejected: 'destructive',
  expired: 'secondary',
}

function formatCurrency(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(v)
}

export default function BidsPage() {
  const { user } = useAuth()
  const canAct = user?.role === 'admin' || user?.role === 'coe_manager'

  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [acceptTarget, setAcceptTarget] = useState<BidWithContext | null>(null)
  const [rejectTarget, setRejectTarget] = useState<BidWithContext | null>(null)
  const [markupPercent, setMarkupPercent] = useState('18')

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkMarkup, setBulkMarkup] = useState('18')
  const [isBulkActing, setIsBulkActing] = useState(false)

  const { bids, total, totalPages, isLoading, error, updateBid, isUpdating } = useBids({
    status: statusFilter,
    page,
    page_size: 20,
  })

  const pendingCount = statusFilter === 'all' ? bids.filter(b => b.status === 'pending').length : (statusFilter === 'pending' ? total : 0)

  async function handleAccept() {
    if (!acceptTarget) return
    const markup = parseFloat(markupPercent)
    if (isNaN(markup) || markup < 0) {
      toast.error('Enter a valid markup percentage')
      return
    }
    try {
      await updateBid({ id: acceptTarget.id, status: 'accepted', cpo_markup_percent: markup })
      toast.success(`Bid accepted — vendor notified, order moved to Quoted`)
      setAcceptTarget(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to accept bid')
    }
  }

  async function handleReject() {
    if (!rejectTarget) return
    try {
      await updateBid({ id: rejectTarget.id, status: 'rejected' })
      toast.success('Bid rejected — vendor notified')
      setRejectTarget(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reject bid')
    }
  }

  const pendingBids = bids.filter(b => b.status === 'pending')
  const allPendingSelected = pendingBids.length > 0 && pendingBids.every(b => selectedIds.has(b.id))

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (allPendingSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingBids.map(b => b.id)))
    }
  }, [allPendingSelected, pendingBids])

  async function handleBulkAccept() {
    const markup = parseFloat(bulkMarkup)
    if (isNaN(markup) || markup < 0) {
      toast.error('Enter a valid markup percentage')
      return
    }
    const targets = bids.filter(b => selectedIds.has(b.id) && b.status === 'pending')
    if (targets.length === 0) return
    setIsBulkActing(true)
    let succeeded = 0
    for (const bid of targets) {
      try {
        await updateBid({ id: bid.id, status: 'accepted', cpo_markup_percent: markup })
        succeeded++
      } catch {
        toast.error(`Failed to accept bid for order #${bid.order?.order_number ?? bid.id.slice(0, 8)}`)
      }
    }
    if (succeeded > 0) toast.success(`${succeeded} bid${succeeded === 1 ? '' : 's'} accepted`)
    setSelectedIds(new Set())
    setIsBulkActing(false)
  }

  async function handleBulkReject() {
    const targets = bids.filter(b => selectedIds.has(b.id) && b.status === 'pending')
    if (targets.length === 0) return
    setIsBulkActing(true)
    let succeeded = 0
    for (const bid of targets) {
      try {
        await updateBid({ id: bid.id, status: 'rejected' })
        succeeded++
      } catch {
        toast.error(`Failed to reject bid for order #${bid.order?.order_number ?? bid.id.slice(0, 8)}`)
      }
    }
    if (succeeded > 0) toast.success(`${succeeded} bid${succeeded === 1 ? '' : 's'} rejected`)
    setSelectedIds(new Set())
    setIsBulkActing(false)
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHero eyebrow="Procurement" title="Bids" description="Could not load bids." />
        <Card className="surface-panel border-border dark:border-white/8 bg-transparent">
          <CardContent className="py-16 text-center">
            <p className="text-lg font-semibold text-red-400">Failed to load bids</p>
            <p className="mt-2 text-sm text-muted-foreground">Check your permissions or try refreshing.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const acceptedMarkup = parseFloat(markupPercent) || 18
  const acceptPreviewUnit = acceptTarget ? acceptTarget.unit_price * (1 + acceptedMarkup / 100) : 0
  const acceptPreviewTotal = acceptTarget ? acceptPreviewUnit * acceptTarget.quantity : 0

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Procurement"
        title="Vendor bids in one place — review, quote, and move orders forward."
        description="See every bid across all CPO orders. Pending bids are waiting for your decision; accepting one quotes the customer automatically."
        stats={[
          { label: 'Total bids', value: total },
          { label: 'Pending review', value: pendingCount },
        ]}
      />

      <Card className="surface-panel border-border dark:border-white/8 bg-transparent">
        <CardHeader>
          <CardTitle className="text-2xl">Bid queue</CardTitle>
          <CardDescription className="mt-2">
            Filter by status, open the linked order for full context, or accept/reject directly from this view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <select
            className="h-11 rounded-2xl border border-input dark:border-white/[0.08] bg-background dark:bg-white/[0.04] px-4 text-sm text-foreground shadow-sm w-48"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-[1rem] bg-muted dark:bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : bids.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.025] px-6 py-16 text-center">
              <Gavel className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-lg font-semibold">No bids found.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {statusFilter === 'pending' ? 'No pending bids — all caught up.' : 'No bids match this filter.'}
              </p>
            </div>
          ) : (
            <>
              {/* Bulk action bar */}
              {canAct && selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
                  <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="bulk-markup" className="text-xs text-muted-foreground whitespace-nowrap">Markup %</Label>
                    <Input
                      id="bulk-markup"
                      type="number"
                      min="0"
                      max="200"
                      step="0.5"
                      value={bulkMarkup}
                      onChange={(e) => setBulkMarkup(e.target.value)}
                      className="h-7 w-20 text-xs"
                    />
                  </div>
                  <Button size="sm" className="h-7 px-3 text-xs" onClick={handleBulkAccept} disabled={isBulkActing}>
                    <CheckCircle className="mr-1 h-3.5 w-3.5" />
                    Accept selected
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={handleBulkReject}
                    disabled={isBulkActing}
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" />
                    Reject selected
                  </Button>
                  <button
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canAct && (
                      <TableHead className="w-10">
                        {pendingBids.length > 0 && (
                          <input
                            type="checkbox"
                            className="rounded border-input accent-primary cursor-pointer"
                            checked={allPendingSelected}
                            onChange={toggleSelectAll}
                            title="Select all pending"
                          />
                        )}
                      </TableHead>
                    )}
                    <TableHead>Order</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Lead Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    {canAct && <TableHead className="w-36" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bids.map((bid) => (
                    <TableRow key={bid.id} className={selectedIds.has(bid.id) ? 'bg-primary/5' : undefined}>
                      {canAct && (
                        <TableCell>
                          {bid.status === 'pending' && (
                            <input
                              type="checkbox"
                              className="rounded border-input accent-primary cursor-pointer"
                              checked={selectedIds.has(bid.id)}
                              onChange={() => toggleSelect(bid.id)}
                            />
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {bid.order ? (
                          <Link href={`/orders/${bid.order.id}`} className="font-medium text-primary hover:underline">
                            #{bid.order.order_number}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-xs">{bid.order_id.slice(0, 8)}…</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {bid.vendor ? (
                          <Link href={`/vendors/${bid.vendor.id}`} className="hover:underline">
                            {bid.vendor.company_name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{bid.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(bid.unit_price)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(bid.total_price ?? bid.unit_price * bid.quantity)}</TableCell>
                      <TableCell>{bid.lead_time_days ? `${bid.lead_time_days}d` : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[bid.status] ?? 'secondary'}>
                          {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {bid.created_at ? new Date(bid.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) : '—'}
                      </TableCell>
                      {canAct && (
                        <TableCell>
                          {bid.status === 'pending' && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => { setAcceptTarget(bid); setMarkupPercent('18') }}
                              >
                                <CheckCircle className="mr-1 h-3.5 w-3.5" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                                onClick={() => setRejectTarget(bid)}
                              >
                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Accept dialog */}
      <AlertDialog open={!!acceptTarget} onOpenChange={(open) => { if (!open) setAcceptTarget(null) }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Accept Vendor Bid</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Accepting <strong className="text-foreground">{acceptTarget?.vendor?.company_name}</strong>'s bid
                  of <strong className="text-foreground">{formatCurrency(acceptTarget?.unit_price)}/unit</strong> × {acceptTarget?.quantity} units
                  for order <strong className="text-foreground">#{acceptTarget?.order?.order_number}</strong>.
                </p>
                <p>The order moves to <strong className="text-foreground">Quoted</strong> and the customer receives their marked-up quote.</p>
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="markup" className="text-foreground">CPO Markup %</Label>
                  <Input
                    id="markup"
                    type="number"
                    min="0"
                    max="200"
                    step="0.5"
                    value={markupPercent}
                    onChange={(e) => setMarkupPercent(e.target.value)}
                    className="w-32"
                  />
                  {acceptTarget && (
                    <p className="text-xs">
                      Customer unit price: <span className="font-semibold text-foreground">{formatCurrency(acceptPreviewUnit)}</span>
                      {' · '}Total: <span className="font-semibold text-foreground">{formatCurrency(acceptPreviewTotal)}</span>
                    </p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAccept} disabled={isUpdating}>
              {isUpdating ? 'Accepting…' : 'Accept & Quote Customer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <AlertDialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Bid</AlertDialogTitle>
            <AlertDialogDescription>
              Reject <strong>{rejectTarget?.vendor?.company_name}</strong>'s bid for order{' '}
              <strong>#{rejectTarget?.order?.order_number}</strong>? The vendor will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReject}
              disabled={isUpdating}
            >
              {isUpdating ? 'Rejecting…' : 'Reject Bid'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
