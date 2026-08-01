'use client'

// ============================================================================
// ADMIN — PLATFORM ANALYTICS
// ============================================================================

import { useEffect, useState } from 'react'
import { Activity, Building2, Loader2, Receipt, Users } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import type { PlatformSummary } from '@/lib/platform-metrics'

export default function PlatformReportPage() {
  const [data, setData] = useState<PlatformSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/reports/platform')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j?.data ?? null))
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
