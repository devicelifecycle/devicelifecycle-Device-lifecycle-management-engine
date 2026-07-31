'use client'

// ============================================================================
// VAR CONSOLE — a reseller's view of its own tenant
// ============================================================================
// Read-only summary of the caller's tenant: identity/branding, the blended
// margin model (BB take + the VAR's corp/rep cuts), and invoices from BB.

import { useEffect, useState } from 'react'
import { Loader2, Building2, Percent, Receipt } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import type { TenantBranding } from '@/lib/branding'
import type { CommissionConfig, MarginSpec } from '@/lib/commission'

interface Overview {
  isPlatform: boolean
  tenant: { id: string; name: string; slug: string; type: string; is_active: boolean; custom_domain: string | null }
  branding: TenantBranding
  commission: CommissionConfig
  invoices: Array<{ id: string; invoice_number: string | null; period_start: string; period_end: string; status: string; total: number; currency: string }>
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const margin = (m: MarginSpec) => (m.type === 'percent' ? pct(m.value) : formatCurrency(m.value))

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-700',
}

export default function VarConsolePage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/var/overview')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j?.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading console…
      </div>
    )
  }
  if (!data) {
    return <div className="p-8 text-sm text-muted-foreground">Unable to load your tenant.</div>
  }

  const { tenant, branding, commission, invoices } = data

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ background: `hsl(${branding.primary})` }}
        >
          {branding.logoText}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{branding.name}</h1>
          <p className="text-sm text-muted-foreground">{branding.tagline}</p>
        </div>
      </div>

      {data.isPlatform && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          You&apos;re viewing the Byte-Back platform tenant. This console mirrors what a VAR tenant sees for its own data.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Tenant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name" value={tenant.name} />
            <Row label="Slug" value={tenant.slug} mono />
            <Row label="Type" value={tenant.type.toUpperCase()} />
            <Row label="Status" value={tenant.is_active ? 'Active' : 'Inactive'} />
            <Row label="Custom domain" value={tenant.custom_domain ?? '—'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Percent className="h-4 w-4" /> Margin model</CardTitle>
            <CardDescription>How each deal is blended.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="BB platform commission" value={pct(commission.platformCommissionPct)} />
            <Row label="BB product margin" value={pct(commission.productMarginPct)} />
            <Row label="Your corp margin" value={margin(commission.corpMargin)} />
            <Row label="Your rep margin" value={margin(commission.repMargin)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-4 w-4" /> Invoices from Byte-Back</CardTitle>
          <CardDescription>{invoices.length} invoice{invoices.length === 1 ? '' : 's'}</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Invoice</th>
                    <th className="pb-2 pr-4 font-medium">Period</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs">{inv.invoice_number ?? '—'}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{inv.period_start} → {inv.period_end}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[inv.status] ?? 'bg-muted'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 text-right font-medium tabular-nums">{formatCurrency(inv.total, inv.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs' : 'font-medium'}>{value}</span>
    </div>
  )
}
