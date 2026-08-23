'use client'

// ============================================================================
// CUSTOMER REPORTS — the customer's own numbers, history, and exports.
// ============================================================================
// Counter cards come from GET /api/customers/me/reports, which scopes to the
// logged-in customer's organization server-side. The two tables read the same
// scoped list APIs as the rest of the console (/api/orders and the device
// register), and the download buttons reuse the existing order-history export.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BarChart3, Download, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMyCustomer } from '@/hooks/useCustomers'
import { useOrders } from '@/hooks/useOrders'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ASSET_STATUS_LABEL, type AssetStatus } from '@/lib/assets'
import { CUSTOMER_STATUS_CONFIG, ORDER_STATUS_CONFIG } from '@/lib/constants'
import type { OrderStatus } from '@/types'

interface ReportStats {
  orders: { total: number; active: number }
  tradeInValue: number
  assets: { total: number; registered: number; assigned: number; retired: number }
}

interface RecentAsset {
  id: string
  label: string
  serial_number: string | null
  status: AssetStatus
  created_at: string
}

const EMPTY_STATS: ReportStats = {
  orders: { total: 0, active: 0 },
  tradeInValue: 0,
  assets: { total: 0, registered: 0, assigned: 0, retired: 0 },
}

const STATUS_STYLE: Record<AssetStatus, string> = {
  registered: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  assigned: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  retired: 'bg-muted text-muted-foreground',
}

const RECENT_ORDERS = 25
const RECENT_ASSETS = 8

export default function CustomerReportsPage() {
  const { customer } = useMyCustomer()
  const [stats, setStats] = useState<ReportStats>(EMPTY_STATS)
  const [loadingStats, setLoadingStats] = useState(true)
  const [recentAssets, setRecentAssets] = useState<RecentAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'pdf' | null>(null)

  // Roll-up counters — one scoped endpoint, same visibility as the export.
  useEffect(() => {
    setLoadingStats(true)
    fetch('/api/customers/me/reports')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setStats(j?.data ?? EMPTY_STATS))
      .catch(() => setStats(EMPTY_STATS))
      .finally(() => setLoadingStats(false))
  }, [])

  // Latest additions to the device register, straight off the register's list API.
  useEffect(() => {
    if (!customer?.id) return
    setLoadingAssets(true)
    fetch(`/api/customer/assets?customer_id=${customer.id}&page=1&limit=${RECENT_ASSETS}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: RecentAsset[] } | null) => setRecentAssets(d?.data ?? []))
      .catch(() => setRecentAssets([]))
      .finally(() => setLoadingAssets(false))
  }, [customer?.id])

  // Order history uses the same scoped list API as the My Orders page.
  const { orders, total, isLoading: loadingOrders } = useOrders({
    page: 1,
    page_size: RECENT_ORDERS,
    sort_by: 'created_at',
    sort_order: 'desc',
  })

  async function handleExportHistory(format: 'csv' | 'pdf') {
    setExportingFormat(format)
    try {
      const res = await fetch(`/api/customers/me/orders/export?format=${format}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `order-history.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not export order history. Please try again.')
    } finally {
      setExportingFormat(null)
    }
  }

  const statusLabel = (status: string) =>
    CUSTOMER_STATUS_CONFIG[status as OrderStatus]?.label ?? ORDER_STATUS_CONFIG[status as OrderStatus]?.label ?? status

  const statuses = Array.from(new Set(orders.map((o) => o.status)))
  const filteredOrders = statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="h-6 w-6 text-primary" /> Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your order totals, device register roll-up, and downloadable exports.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={exportingFormat !== null}
            onClick={() => handleExportHistory('pdf')}
          >
            {exportingFormat === 'pdf' ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-2 h-3.5 w-3.5" />}
            Download PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exportingFormat !== null}
            onClick={() => handleExportHistory('csv')}
          >
            {exportingFormat === 'csv' ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total orders" value={loadingStats ? '—' : stats.orders.total.toLocaleString()} />
        <Metric label="Active orders" value={loadingStats ? '—' : stats.orders.active.toLocaleString()} />
        <Metric label="Devices registered" value={loadingStats ? '—' : stats.assets.total.toLocaleString()} />
        <Metric label="Trade-in value" value={loadingStats ? '—' : formatCurrency(stats.tradeInValue)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order history</CardTitle>
          <CardDescription>{total} total order{total === 1 ? '' : 's'} — showing the most recent {RECENT_ORDERS}.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex justify-end">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {loadingOrders ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : orders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No orders yet.</p>
          ) : filteredOrders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No orders match this status.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/customer/orders/${o.id}`} className="font-medium text-primary hover:underline">
                          {o.order_number || '—'}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {o.type === 'trade_in' ? 'Trade-In' : 'CPO'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="secondary" className="text-[11px]">
                          {statusLabel(o.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {o.created_at ? formatDate(o.created_at) : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                        {formatCurrency(o.quoted_amount ?? o.total_amount ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Device register summary</CardTitle>
          <CardDescription>Your devices by status, plus the latest additions.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStats || loadingAssets ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : stats.assets.total === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No devices registered yet.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${STATUS_STYLE.registered}`}>
                  {stats.assets.registered} registered
                </span>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${STATUS_STYLE.assigned}`}>
                  {stats.assets.assigned} assigned
                </span>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${STATUS_STYLE.retired}`}>
                  {stats.assets.retired} retired
                </span>
              </div>
              <p className="mb-2 mt-6 text-sm font-medium">Recently added</p>
              {recentAssets.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nothing added recently.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device</TableHead>
                        <TableHead>Serial</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Added</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentAssets.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.label || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{a.serial_number || '—'}</TableCell>
                          <TableCell>
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status] ?? STATUS_STYLE.retired}`}>
                              {ASSET_STATUS_LABEL[a.status] ?? a.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {a.created_at ? formatDate(a.created_at) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}