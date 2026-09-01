'use client'

// ============================================================================
// ADMIN — PLATFORM ANALYTICS
// ============================================================================

import { useEffect, useState } from 'react'
import { ComingSoon } from '@/components/ComingSoon'
import { Activity, Building2, ClipboardCheck, Database, KeyRound, Loader2, Plug, Receipt, ShieldAlert, Users } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import type { PlatformSummary } from '@/lib/platform-metrics'
import type { OperationsSummary } from '@/lib/operations-metrics'
import type { TradeInKpiSummary } from '@/lib/trade-in-kpis'

type OperationsSummaryWithKpis = OperationsSummary & { tradeInKpis: TradeInKpiSummary }

/** '—' for a null metric (no qualifying data in the window) rather than a misleading 0. */
const pctOrDash = (v: number | null): string => (v === null ? '—' : `${v}%`)
const daysOrDash = (v: number | null): string => (v === null ? '—' : `${v} day${v === 1 ? '' : 's'}`)

export default function PlatformReportPage() {
  return <ComingSoon title="Platform Analytics" />
}

function PlatformReportPageImpl() {
  const [data, setData] = useState<PlatformSummary | null>(null)
  const [ops, setOps] = useState<OperationsSummaryWithKpis | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/reports/platform').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/admin/reports/operations').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([j, oj]) => { setData(j?.data ?? null); setOps(oj?.data ?? null) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading platform metrics…</div>
  }
  if (!data) return <div className="p-8 text-sm text-muted-foreground">Unable to load platform metrics.</div>

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Activity className="h-6 w-6 text-primary" /> Platform Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Global recurring revenue, recognized revenue, and platform-wide counts.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={<Receipt className="h-4 w-4" />} label="MRR" value={formatCurrency(data.mrr)} sub={`${formatCurrency(data.arr)} ARR`} />
        <Metric icon={<Receipt className="h-4 w-4" />} label="Revenue (paid)" value={formatCurrency(data.revenuePaid)} sub={`${formatCurrency(data.revenueOutstanding)} outstanding`} />
        <Metric icon={<Building2 className="h-4 w-4" />} label="VARs" value={String(data.tenants.vars)} sub={`${data.tenants.active} active tenants`} />
        <Metric icon={<Users className="h-4 w-4" />} label="Customers" value={String(data.customers.total)} sub={`${data.customers.active} active`} />
        <Metric icon={<Activity className="h-4 w-4" />} label="Orders" value={data.orders.toLocaleString()} />
        <Metric icon={<Activity className="h-4 w-4" />} label="Devices" value={data.devices.toLocaleString()} />
        <Metric icon={<Building2 className="h-4 w-4" />} label="Inactive tenants" value={String(data.tenants.inactive)} />
        <Metric icon={<Users className="h-4 w-4" />} label="Inactive customers" value={String(data.customers.inactive)} />
      </div>
      {ops && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              icon={<Activity className="h-4 w-4" />}
              label="Orders this month"
              value={ops.ordersThisMonth.toLocaleString()}
              sub={ops.ordersDeltaPct === null ? 'No orders last month' : `${ops.ordersDeltaPct >= 0 ? '+' : ''}${ops.ordersDeltaPct}% vs last month (${ops.ordersLastMonth.toLocaleString()})`}
            />
            <Metric icon={<Building2 className="h-4 w-4" />} label="Active VARs" value={String(ops.activeVars)} />
            <Metric icon={<Users className="h-4 w-4" />} label="Users" value={String(ops.users.total)} sub={`${ops.users.active} active · ${ops.users.inactive} inactive`} />
            <Metric icon={<Database className="h-4 w-4" />} label="Storage" value="Not yet metered" sub="No runtime storage source exists yet" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Plug className="h-4 w-4" /> Notifications (30d)</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full max-w-md text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Channel</th>
                    <th className="pb-2 font-medium">Sent</th>
                    <th className="pb-2 font-medium">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {(['email', 'sms'] as const).map((ch) => {
                    const sent = ops.notifications.find((n) => n.channel === ch && n.status === 'sent')
                    const failed = ops.notifications.find((n) => n.channel === ch && n.status === 'failed')
                    return (
                      <tr key={ch} className="border-b last:border-0">
                        <td className="py-2 capitalize">{ch}</td>
                        <td className="py-2 tabular-nums">{(sent?.count ?? 0).toLocaleString()}</td>
                        <td className={`py-2 tabular-nums ${(failed?.count ?? 0) > 0 ? 'text-red-600' : ''}`}>{(failed?.count ?? 0).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> Licenses by active VAR</CardTitle>
            </CardHeader>
            <CardContent>
              {ops.licenses.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No active VARs.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">VAR</th>
                      <th className="pb-2 pr-4 font-medium">License tier</th>
                      <th className="pb-2 font-medium text-right">Customers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.licenses.map((l) => (
                      <tr key={l.tenantId} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{l.tenantName}</td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{l.tier}</td>
                        <td className="py-2 text-right tabular-nums">{l.customers.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" /> Trade-in quote process KPIs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Metric icon={<Activity className="h-4 w-4" />} label="Quote-to-acceptance conversion" value={pctOrDash(ops.tradeInKpis.quoteConversionRatePct)} sub="90-day window" />
                <Metric icon={<Activity className="h-4 w-4" />} label="Device receipt time" value={daysOrDash(ops.tradeInKpis.deviceReceiptTimeDays)} sub="Submission → arrival" />
                <Metric icon={<Activity className="h-4 w-4" />} label="Inspection turnaround" value={daysOrDash(ops.tradeInKpis.inspectionTurnaroundDays)} sub="Receipt → final grade" />
                <Metric icon={<Activity className="h-4 w-4" />} label="Grade adjustment rate" value={pctOrDash(ops.tradeInKpis.gradeAdjustmentRatePct)} sub="Final value differed from estimate" />
                <Metric icon={<Activity className="h-4 w-4" />} label="Customer dispute rate" value={pctOrDash(ops.tradeInKpis.customerDisputeRatePct)} sub="Of adjusted offers" />
                <Metric icon={<Database className="h-4 w-4" />} label="Recovery value" value="Not yet tracked" sub="No disposition-routing data source exists yet" />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Settlement accuracy is also not yet tracked — no device-level settlement/reconciliation data source exists yet.</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4" /> Security — failed logins</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Not yet recorded. Logins authenticate directly with Supabase Auth from the browser, so failed attempts never reach an app server that could audit them.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Plug className="h-4 w-4" /> API usage</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Not yet metered. Per-VAR API-call metering has no runtime source yet.</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}
