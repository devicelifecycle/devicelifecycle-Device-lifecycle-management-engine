'use client'

import { useQuery } from '@tanstack/react-query'
import { Trophy, Clock, DollarSign, Package, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PageHero } from '@/components/ui/page-hero'
import { formatCurrency } from '@/lib/utils'

interface BidComparisonPoint {
  order_id: string
  your_unit_price: number
  winning_unit_price: number | null
  you_won: boolean
  delta_percent: number | null
}

interface VendorPerformanceResponse {
  bids: {
    total: number
    accepted: number
    rejected: number
    pending: number
    expired: number
    win_rate_percent: number | null
    avg_accepted_unit_price: number | null
    avg_lead_time_days: number | null
  }
  orders: {
    total: number
    active: number
    completed: number
    total_fulfilled_value: number
    total_devices_fulfilled: number
  }
  bid_comparison: {
    decided_bids: number
    avg_delta_percent: number | null
    points: BidComparisonPoint[]
  }
}

async function fetchMyPerformance(): Promise<VendorPerformanceResponse> {
  const res = await fetch('/api/vendors/me/performance')
  if (!res.ok) throw new Error('Failed to fetch performance')
  return res.json()
}

export default function VendorPerformancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['vendor-my-performance'],
    queryFn: fetchMyPerformance,
    staleTime: 60_000,
  })

  const winRate = data?.bids.win_rate_percent
  const avgDelta = data?.bid_comparison.avg_delta_percent

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Vendor Workspace"
        title="Your performance, at a glance."
        description="Win rate, fulfillment, earnings, and how your bids compare to the prices that actually won — all scoped to your organization."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Win Rate', value: winRate != null ? `${winRate}%` : '—', icon: Trophy, tone: 'text-emerald-400' },
          { label: 'Avg Lead Time', value: data?.bids.avg_lead_time_days != null ? `${data.bids.avg_lead_time_days}d` : '—', icon: Clock, tone: 'text-amber-400' },
          { label: 'Total Earnings', value: data ? formatCurrency(data.orders.total_fulfilled_value) : '—', icon: DollarSign, tone: 'text-primary' },
          { label: 'Devices Fulfilled', value: data?.orders.total_devices_fulfilled ?? '—', icon: Package, tone: 'text-blue-400' },
        ].map((stat) => (
          <Card key={stat.label} className="metric-tile">
            <CardContent className="p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
                  <div className="mt-3 text-3xl font-semibold text-foreground">
                    {isLoading ? '—' : stat.value}
                  </div>
                </div>
                <div className={stat.tone}><stat.icon className="h-6 w-6" /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bid Outcomes</CardTitle>
            <CardDescription>How your {data?.bids.total ?? 0} submitted bids broke down.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Accepted', value: data?.bids.accepted ?? 0, tone: 'bg-emerald-500/15 text-emerald-500' },
              { label: 'Pending', value: data?.bids.pending ?? 0, tone: 'bg-amber-500/15 text-amber-500' },
              { label: 'Rejected', value: data?.bids.rejected ?? 0, tone: 'bg-red-500/15 text-red-500' },
              { label: 'Expired', value: data?.bids.expired ?? 0, tone: 'bg-muted text-muted-foreground' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-xl border px-4 py-3">
                <span className="text-sm font-medium">{row.label}</span>
                <Badge className={row.tone} variant="outline">{row.value}</Badge>
              </div>
            ))}
            {data?.bids.avg_accepted_unit_price != null && (
              <p className="pt-1 text-xs text-muted-foreground">
                Average accepted unit price: {formatCurrency(data.bids.avg_accepted_unit_price)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              How You Bid vs. the Winning Price
              {avgDelta != null && (avgDelta > 0
                ? <TrendingUp className="h-4 w-4 text-red-500" />
                : <TrendingDown className="h-4 w-4 text-emerald-500" />)}
            </CardTitle>
            <CardDescription>
              {data?.bid_comparison.decided_bids
                ? `Across ${data.bid_comparison.decided_bids} decided order${data.bid_comparison.decided_bids === 1 ? '' : 's'} you bid on.`
                : 'No decided orders yet to compare against.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {avgDelta != null ? (
              <div className="mb-4 rounded-xl border px-4 py-3">
                <p className="text-2xl font-semibold">
                  {avgDelta > 0 ? '+' : ''}{avgDelta}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {avgDelta > 0
                    ? 'On average, you bid above the price that won — pricing closer to the winner could improve your win rate.'
                    : 'On average, you bid at or below the price that won.'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">Not enough decided bids yet.</p>
            )}
            {!!data?.bid_comparison.points.length && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Your Bid</TableHead>
                    <TableHead>Winning Bid</TableHead>
                    <TableHead className="text-right">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bid_comparison.points.slice(0, 8).map((p) => (
                    <TableRow key={p.order_id}>
                      <TableCell className="font-mono text-xs">{p.order_id.slice(0, 8)}</TableCell>
                      <TableCell>{formatCurrency(p.your_unit_price)}</TableCell>
                      <TableCell>{p.winning_unit_price != null ? formatCurrency(p.winning_unit_price) : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={p.you_won ? 'default' : 'secondary'}>{p.you_won ? 'Won' : 'Lost'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
