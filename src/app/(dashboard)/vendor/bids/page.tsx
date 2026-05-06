'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Gavel, Clock, CheckCircle2, XCircle, AlertCircle, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHero } from '@/components/ui/page-hero'
import { formatCurrency } from '@/lib/utils'
import type { VendorBid } from '@/types'

type BidWithOrder = VendorBid & {
  order?: { id: string; order_number: string; type: string; status: string; total_quantity: number }
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
]

async function fetchMyBids(): Promise<{ data: BidWithOrder[] }> {
  const res = await fetch('/api/vendors/bids')
  if (!res.ok) throw new Error('Failed to fetch bids')
  return res.json()
}

function ExpiryCountdown({ expiresAt }: { expiresAt?: string }) {
  if (!expiresAt) return <span className="text-muted-foreground">—</span>

  const now = Date.now()
  const exp = new Date(expiresAt).getTime()
  const diffMs = exp - now

  if (diffMs <= 0) {
    return <span className="text-xs text-destructive font-medium">Expired</span>
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days === 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-500">
        <AlertCircle className="h-3.5 w-3.5" />
        {hours}h left
      </span>
    )
  }
  if (days <= 3) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-500">
        <Clock className="h-3.5 w-3.5" />
        {days}d {hours}h
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3.5 w-3.5" />
      {days} days
    </span>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'accepted') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'rejected') return <XCircle className="h-4 w-4 text-destructive" />
  if (status === 'expired') return <Clock className="h-4 w-4 text-muted-foreground" />
  return <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
}

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  accepted: 'default',
  rejected: 'destructive',
  expired: 'secondary',
}

export default function VendorBidsPage() {
  const [statusFilter, setStatusFilter] = useState('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['vendor-my-bids'],
    queryFn: fetchMyBids,
    refetchInterval: 60_000,
  })

  const allBids: BidWithOrder[] = data?.data || []

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return allBids
    return allBids.filter(b => b.status === statusFilter)
  }, [allBids, statusFilter])

  const stats = useMemo(() => ({
    pending: allBids.filter(b => b.status === 'pending').length,
    accepted: allBids.filter(b => b.status === 'accepted').length,
    rejected: allBids.filter(b => b.status === 'rejected').length,
    totalAcceptedValue: allBids
      .filter(b => b.status === 'accepted')
      .reduce((sum, b) => sum + (b.total_price ?? b.unit_price * b.quantity), 0),
  }), [allBids])

  if (error) {
    return (
      <div className="space-y-6">
        <PageHero eyebrow="My Activity" title="My Bids" description="Could not load bids." />
        <Card className="surface-panel border-border dark:border-white/8 bg-transparent">
          <CardContent className="py-16 text-center">
            <p className="text-lg font-semibold text-red-400">Failed to load bids</p>
            <p className="mt-2 text-sm text-muted-foreground">Try refreshing the page.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="My Activity"
        title="Track every bid you've submitted and see where each one stands."
        description="Pending bids are waiting for admin review. Accepted bids mean the order is yours to fulfill. Check expiry countdowns so you know when to follow up."
        actions={
          <Button asChild>
            <Link href="/vendor/orders">
              <Send className="mr-2 h-4 w-4" />
              Browse Open Orders
            </Link>
          </Button>
        }
        stats={[
          { label: 'Pending review', value: stats.pending },
          { label: 'Accepted', value: stats.accepted },
          { label: 'Rejected', value: stats.rejected },
          { label: 'Won value', value: formatCurrency(stats.totalAcceptedValue) },
        ]}
      />

      <Card className="surface-panel border-border dark:border-white/8 bg-transparent">
        <CardHeader>
          <CardTitle className="text-2xl">Bid history</CardTitle>
          <CardDescription className="mt-2">
            All bids you have submitted. Pending bids show expiry countdowns — follow up before they lapse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <select
            className="h-11 rounded-2xl border border-input dark:border-white/[0.08] bg-background dark:bg-white/[0.04] px-4 text-sm text-foreground shadow-sm w-44"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
          ) : filtered.length === 0 ? (
            <div className="rounded-[1.6rem] border border-dashed border-border dark:border-white/10 bg-muted/30 dark:bg-white/[0.025] px-6 py-16 text-center">
              <Gavel className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-lg font-semibold">
                {allBids.length === 0 ? 'No bids yet.' : 'No bids match this filter.'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {allBids.length === 0
                  ? 'Browse open CPO orders and submit your first bid.'
                  : 'Try a different status filter.'}
              </p>
              {allBids.length === 0 && (
                <Button className="mt-5" asChild>
                  <Link href="/vendor/orders">Browse Open Orders</Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {filtered.map((bid) => (
                  <div key={bid.id} className="rounded-[1.2rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        {bid.order ? (
                          <Link href={`/orders/${bid.order.id}`} className="font-semibold text-primary hover:underline">
                            #{bid.order.order_number}
                          </Link>
                        ) : (
                          <span className="font-semibold text-muted-foreground text-xs">{bid.order_id.slice(0, 8)}…</span>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {bid.quantity} units · {formatCurrency(bid.unit_price)}/unit
                          {bid.lead_time_days ? ` · ${bid.lead_time_days}d lead` : ''}
                        </p>
                        {bid.created_at && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(bid.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon status={bid.status} />
                          <Badge variant={STATUS_BADGE[bid.status] ?? 'secondary'} className="text-xs">
                            {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                          </Badge>
                        </div>
                        {bid.status === 'pending' && <ExpiryCountdown expiresAt={bid.expires_at} />}
                      </div>
                    </div>
                    <div className="pt-2 border-t border-border dark:border-white/8">
                      <p className="text-sm font-semibold text-foreground">
                        Total: {formatCurrency(bid.total_price ?? bid.unit_price * bid.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((bid) => (
                      <TableRow key={bid.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusIcon status={bid.status} />
                            <Badge variant={STATUS_BADGE[bid.status] ?? 'secondary'} className="text-xs">
                              {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {bid.order ? (
                            <div>
                              <Link href={`/orders/${bid.order.id}`} className="font-medium text-primary hover:underline">
                                #{bid.order.order_number}
                              </Link>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {bid.order.total_quantity} units needed
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">{bid.order_id.slice(0, 8)}…</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{bid.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(bid.unit_price)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(bid.total_price ?? bid.unit_price * bid.quantity)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {bid.lead_time_days ? `${bid.lead_time_days}d` : '—'}
                        </TableCell>
                        <TableCell>
                          {bid.status === 'pending'
                            ? <ExpiryCountdown expiresAt={bid.expires_at} />
                            : <span className="text-muted-foreground text-xs">—</span>
                          }
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {bid.created_at
                            ? new Date(bid.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
