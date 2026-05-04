// ============================================================================
// REPORTS PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  ShoppingCart, DollarSign, TrendingUp, TrendingDown,
  Package, AlertTriangle, CheckCircle2, Clock, BarChart3,
  RefreshCw, Loader2, FileSearch, ArrowRightLeft,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'

interface DailyPoint { date: string; count: number; revenue: number }
interface TopDevice { make: string; model: string; count: number; total: number }

interface ReconciliationItem {
  id: string
  order_number: string
  order_type: string
  order_status: string
  counterparty: string
  counterparty_label: string
  device: string
  storage: string
  quantity: number
  claimed_condition: string
  actual_condition: string
  condition_changed: boolean
  claimed_value: number
  coe_value: number
  price_adjustment: number
  mismatch_severity: string
  approval_status: string
  created_at: string
}

interface ReconciliationData {
  period_days: number
  summary: {
    total_exceptions: number
    condition_mismatches: number
    pending: number
    resolved: number
    total_value_adjustment: number
    by_type: {
      trade_in: { count: number; total_adjustment: number; pending: number; approved: number }
      cpo: { count: number; total_adjustment: number; pending: number; approved: number }
    }
    by_severity: { minor: number; moderate: number; major: number }
  }
  items: ReconciliationItem[]
}

interface ReportData {
  period_days: number
  orders: {
    total: number; active: number; by_status: Record<string, number>
    by_type: { trade_in: number; cpo: number }
    total_value: number; avg_value: number
    completion_rate: number; cancellation_rate: number
    this_period: number; prev_period: number; period_growth: number | null
  }
  revenue: {
    total: number; this_period: number; prev_period: number
    period_growth: number | null; daily: DailyPoint[]
  }
  top_devices: TopDevice[]
  pricing: { total_competitor_prices: number; devices_with_prices: number }
  operations: { sla_breaches_in_period: number; open_exceptions: number }
}

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{pct}%
    </span>
  )
}

const PERIOD_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
]

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('30')
  const [recon, setRecon] = useState<ReconciliationData | null>(null)
  const [reconLoading, setReconLoading] = useState(true)
  const [reconType, setReconType] = useState<'all' | 'trade_in' | 'cpo'>('all')

  const load = useCallback(async (days: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports?days=${days}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRecon = useCallback(async (days: string, type: string) => {
    setReconLoading(true)
    try {
      const res = await fetch(`/api/reports/reconciliation?days=${days}&order_type=${type}`)
      if (res.ok) setRecon(await res.json())
    } finally {
      setReconLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [load, period])
  useEffect(() => { loadRecon(period, reconType) }, [loadRecon, period, reconType])

  // Format date label for chart — show "Apr 10" style
  const fmtDay = (d: string) => {
    const dt = new Date(d + 'T00:00:00')
    return dt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  }

  // Show every Nth label so the axis doesn't crowd
  const tickEvery = period === '7' ? 1 : period === '30' ? 5 : 14

  const topStatusEntries = data
    ? Object.entries(data.orders.by_status).sort(([, a], [, b]) => b - a)
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Analytics and performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={v => { setPeriod(v); }}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => load(period)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && !data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl skeleton-3d" />)}
        </div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="holographic card-3d">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Orders</p>
                    <p className="text-2xl font-bold mt-1">{data.orders.total.toLocaleString()}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-muted-foreground">This period: {data.orders.this_period}</span>
                      <GrowthBadge pct={data.orders.period_growth} />
                    </div>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10">
                    <ShoppingCart className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="holographic card-3d">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Value</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(data.orders.total_value)}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-muted-foreground">Period: {formatCurrency(data.revenue.this_period)}</span>
                      <GrowthBadge pct={data.revenue.period_growth} />
                    </div>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10">
                    <DollarSign className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="holographic card-3d">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg. Order Value</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(data.orders.avg_value)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.orders.completion_rate}% completion rate
                    </p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="holographic card-3d">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Orders</p>
                    <p className="text-2xl font-bold mt-1">{data.orders.active}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {data.operations.open_exceptions} open exceptions
                    </p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10">
                    <Package className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Daily order volume */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Order Volume
                </CardTitle>
                <CardDescription>Orders created per day</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.revenue.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v, i) => i % tickEvery === 0 ? fmtDay(v) : ''}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      labelFormatter={v => fmtDay(String(v))}
                      formatter={(v: number) => [v, 'Orders']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Daily revenue */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  Revenue Trend
                </CardTitle>
                <CardDescription>Order value created per day</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.revenue.daily} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v, i) => i % tickEvery === 0 ? fmtDay(v) : ''}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      labelFormatter={v => fmtDay(String(v))}
                      formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }}
                    />
                    <Bar dataKey="revenue" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Bottom row */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Order status breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Orders by Status</CardTitle>
                <CardDescription>Full pipeline distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {topStatusEntries.slice(0, 10).map(([status, count]) => {
                    const cfg = ORDER_STATUS_CONFIG[status as keyof typeof ORDER_STATUS_CONFIG]
                    const pct = data.orders.total > 0 ? (count / data.orders.total) * 100 : 0
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <span className={`w-28 text-xs font-medium truncate ${cfg?.color || 'text-muted-foreground'}`}>
                          {cfg?.label || status}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${cfg?.bgColor || 'bg-gray-300'}`}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-6 text-right tabular-nums">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Top devices */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Traded Devices</CardTitle>
                <CardDescription>Most frequent in this period</CardDescription>
              </CardHeader>
              <CardContent>
                {data.top_devices.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No device data for this period</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.top_devices.slice(0, 8).map((d, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{d.make} {d.model}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(d.total / d.count)} avg</p>
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0">{d.count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ops health */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Operations Health</CardTitle>
                <CardDescription>Key indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {/* Order type split */}
                <div className="rounded-lg border p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">Order Type Split</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Trade-In vs CPO</p>
                  </div>
                  <div className="text-right text-xs">
                    <p><span className="font-medium text-blue-600">{data.orders.by_type.trade_in}</span> trade-in</p>
                    <p><span className="font-medium text-purple-600">{data.orders.by_type.cpo}</span> CPO</p>
                  </div>
                </div>

                <div className="rounded-lg border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-medium">Completion Rate</span>
                  </div>
                  <span className="text-sm font-bold text-green-600">{data.orders.completion_rate}%</span>
                </div>

                <div className="rounded-lg border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-medium">Cancellation Rate</span>
                  </div>
                  <span className="text-sm font-bold">{data.orders.cancellation_rate}%</span>
                </div>

                <div className="rounded-lg border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-xs font-medium">SLA Breaches</span>
                  </div>
                  <Badge variant={data.operations.sla_breaches_in_period > 0 ? 'destructive' : 'secondary'}>
                    {data.operations.sla_breaches_in_period}
                  </Badge>
                </div>

                <div className="rounded-lg border p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-blue-500" />
                    <span className="text-xs font-medium">Competitor Prices</span>
                  </div>
                  <span className="text-xs font-medium tabular-nums">
                    {data.pricing.total_competitor_prices.toLocaleString()} rows
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ── Discrepancy Reconciliation Report ──────────────────────────────── */}
      <div className="pt-2 border-t">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold">Discrepancy Reconciliation</h2>
              <p className="text-xs text-muted-foreground">
                Customer Trade-In vs COE assessed value · Vendor CPO price vs COE assessment
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={reconType} onValueChange={v => setReconType(v as typeof reconType)}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="trade_in">Trade-In Only</SelectItem>
                <SelectItem value="cpo">CPO Only</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => loadRecon(period, reconType)} disabled={reconLoading}>
              {reconLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {reconLoading && !recon && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl skeleton-3d" />)}
          </div>
        )}

        {recon && (
          <>
            {/* Summary KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Exceptions</p>
                  <p className="text-2xl font-bold mt-1">{recon.summary.total_exceptions}</p>
                  <p className="text-xs text-muted-foreground mt-1">{recon.summary.condition_mismatches} condition mismatches</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Value Adjustment</p>
                  <p className={`text-2xl font-bold mt-1 ${recon.summary.total_value_adjustment < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(Math.abs(recon.summary.total_value_adjustment))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {recon.summary.total_value_adjustment < 0 ? 'Net reduction from claims' : 'Net increase vs claims'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending Review</p>
                  <p className={`text-2xl font-bold mt-1 ${recon.summary.pending > 0 ? 'text-amber-600' : ''}`}>
                    {recon.summary.pending}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{recon.summary.resolved} resolved</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Severity</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="destructive" className="text-xs">{recon.summary.by_severity.major} Major</Badge>
                    <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">{recon.summary.by_severity.moderate} Mod</Badge>
                    <Badge variant="secondary" className="text-xs">{recon.summary.by_severity.minor} Minor</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Trade-In vs CPO split */}
            {reconType === 'all' && (
              <div className="grid gap-4 sm:grid-cols-2 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Trade-In: Customer vs COE</CardTitle>
                    <CardDescription className="text-xs">Claimed condition/value vs COE triage result</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Exceptions</span>
                      <span className="font-medium">{recon.summary.by_type.trade_in.count}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Value Adjustment</span>
                      <span className={`font-medium tabular-nums ${recon.summary.by_type.trade_in.total_adjustment < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {recon.summary.by_type.trade_in.total_adjustment >= 0 ? '+' : ''}{formatCurrency(recon.summary.by_type.trade_in.total_adjustment)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pending</span>
                      <Badge variant={recon.summary.by_type.trade_in.pending > 0 ? 'secondary' : 'outline'} className="text-xs">
                        {recon.summary.by_type.trade_in.pending}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">CPO: Vendor vs COE</CardTitle>
                    <CardDescription className="text-xs">Vendor bid price vs COE assessed value</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Exceptions</span>
                      <span className="font-medium">{recon.summary.by_type.cpo.count}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Value Adjustment</span>
                      <span className={`font-medium tabular-nums ${recon.summary.by_type.cpo.total_adjustment < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {recon.summary.by_type.cpo.total_adjustment >= 0 ? '+' : ''}{formatCurrency(recon.summary.by_type.cpo.total_adjustment)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pending</span>
                      <Badge variant={recon.summary.by_type.cpo.pending > 0 ? 'secondary' : 'outline'} className="text-xs">
                        {recon.summary.by_type.cpo.pending}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Line-item table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-muted-foreground" />
                  Exception Line Items
                </CardTitle>
                <CardDescription className="text-xs">Each row = one device exception with claimed vs COE values</CardDescription>
              </CardHeader>
              <CardContent>
                {recon.items.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No discrepancies found for this period and filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 px-2 font-medium">Order</th>
                          <th className="text-left py-2 px-2 font-medium">Type</th>
                          <th className="text-left py-2 px-2 font-medium">Counterparty</th>
                          <th className="text-left py-2 px-2 font-medium">Device</th>
                          <th className="text-left py-2 px-2 font-medium">Claimed Cond.</th>
                          <th className="text-left py-2 px-2 font-medium">COE Cond.</th>
                          <th className="text-right py-2 px-2 font-medium">Claimed $</th>
                          <th className="text-right py-2 px-2 font-medium">COE $</th>
                          <th className="text-right py-2 px-2 font-medium">Δ Adj.</th>
                          <th className="text-left py-2 px-2 font-medium">Severity</th>
                          <th className="text-left py-2 px-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recon.items.map(item => (
                          <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-2 font-medium text-blue-600">{item.order_number}</td>
                            <td className="py-2 px-2">
                              <Badge variant="outline" className="text-xs">
                                {item.order_type === 'trade_in' ? 'Trade-In' : 'CPO'}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 max-w-[120px] truncate" title={item.counterparty}>
                              <span className="text-muted-foreground text-[10px] block">{item.counterparty_label}</span>
                              {item.counterparty}
                            </td>
                            <td className="py-2 px-2">
                              <span className="block font-medium">{item.device}</span>
                              {item.storage && <span className="text-muted-foreground">{item.storage}</span>}
                            </td>
                            <td className="py-2 px-2 capitalize">{item.claimed_condition.replace(/_/g, ' ')}</td>
                            <td className="py-2 px-2 capitalize">
                              <span className={item.condition_changed ? 'text-amber-700 font-medium' : ''}>
                                {item.actual_condition.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(item.claimed_value)}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(item.coe_value)}</td>
                            <td className={`py-2 px-2 text-right tabular-nums font-medium ${item.price_adjustment < 0 ? 'text-red-600' : item.price_adjustment > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {item.price_adjustment === 0 ? '—' : `${item.price_adjustment > 0 ? '+' : ''}${formatCurrency(item.price_adjustment)}`}
                            </td>
                            <td className="py-2 px-2">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${item.mismatch_severity === 'major' ? 'bg-red-100 text-red-800' : item.mismatch_severity === 'moderate' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}
                              >
                                {item.mismatch_severity}
                              </Badge>
                            </td>
                            <td className="py-2 px-2">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${item.approval_status === 'admin_approved' || item.approval_status === 'overridden' ? 'bg-green-100 text-green-800' : item.approval_status === 'rejected' ? 'bg-gray-100 text-gray-600' : item.approval_status === 'coe_approved' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}
                              >
                                {item.approval_status.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {recon.items.length >= 500 && (
                      <p className="text-xs text-muted-foreground mt-2 text-center">Showing most recent 500 exceptions. Narrow period or filter to see all.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
