'use client'

// ============================================================================
// VAR CONSOLE — a reseller's view of its own tenant
// ============================================================================
// Summary of the caller's tenant: identity/branding, the blended margin model
// (BB take + the VAR's corp/rep cuts — the VAR's own two are editable here),
// and invoices from BB.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Building2, Percent, Receipt, Save } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { hasPermission } from '@/lib/permissions'
import { BILLING_MODE_LABELS, type BillingMode } from '@/lib/customer-billing'
import { useCan } from '@/hooks/useCan'
import type { TenantBranding } from '@/lib/branding'
import type { CommissionConfig, MarginSpec } from '@/lib/commission'

interface Overview {
  isPlatform: boolean
  tenant: { id: string; name: string; slug: string; type: string; is_active: boolean; custom_domain: string | null }
  branding: TenantBranding
  // BB blended-take fields are redacted (null) for non-admin VAR operators.
  commission: Omit<CommissionConfig, 'platformCommissionPct' | 'productMarginPct' | 'holdbackPct'> & {
    platformCommissionPct: number | null
    productMarginPct: number | null
    holdbackPct: number | null
  }
  billingMode: BillingMode
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

export default function VarConsolePageImpl() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  // The server gate (PATCH /api/var/margins) checks the ACTIVE role only, so
  // mirror that here rather than useCan()'s active-or-secondary union — a
  // control that renders and then 403s is worse than one that doesn't render.
  const { role } = useCan()
  const canEditMargins = hasPermission(role, 'commission.var_margins')

  const load = useCallback(() => {
    return fetch('/api/var/overview')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j?.data ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

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
            {commission.platformCommissionPct !== null && (
              <Row label="BB platform commission" value={pct(commission.platformCommissionPct)} />
            )}
            {commission.productMarginPct !== null && (
              <Row label="BB product margin" value={pct(commission.productMarginPct)} />
            )}
            <Row label="Your corp margin" value={margin(commission.corpMargin)} />
            <Row label="Your rep margin" value={margin(commission.repMargin)} />
            {canEditMargins && !data.isPlatform && (
              <BillingModeEditor mode={data.billingMode} onSaved={load} />
            )}
            {canEditMargins && !data.isPlatform && (
              <MarginEditor
                corp={commission.corpMargin}
                rep={commission.repMargin}
                onSaved={load}
              />
            )}
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

/**
 * Which billing model this VAR uses with its own customers. Option A (the
 * default) means they invoice outside the platform and nothing here changes;
 * Option B turns on the in-platform Customer Invoices page. Both are
 * supported per the client's 2026-09-22 answer, chosen per VAR.
 */
function BillingModeEditor({ mode, onSaved }: { mode: BillingMode; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<BillingMode>(mode)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(mode) }, [mode])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/var/margins', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingMode: draft }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to save billing mode')
      toast.success(draft === 'in_platform' ? 'Customer invoicing is on — see Customer Invoices in the sidebar' : 'Switched to billing customers outside the platform')
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save billing mode')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <div className="space-y-1.5">
        <Label className="text-xs">How you bill your customers</Label>
        <Select value={draft} onValueChange={(v) => setDraft(v as BillingMode)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="external">{BILLING_MODE_LABELS.external}</SelectItem>
            <SelectItem value="in_platform">{BILLING_MODE_LABELS.in_platform}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {draft === 'in_platform'
            ? 'Raise invoices from completed orders, apply your customer’s regional tax, and track what is outstanding. Card collection is not included yet — payments are recorded by hand.'
            : 'Nothing changes here: you bill your customers in your own system. Byte-Back still invoices you for commission separately.'}
        </p>
      </div>
      <Button size="sm" onClick={save} disabled={saving || draft === mode}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save billing mode
      </Button>
    </div>
  )
}

/**
 * The VAR's own two margin inputs (outline: "Corp Tab / Rep Tab margin input
 * fields"). BB's platform commission, product margin and holdback are not
 * editable from here — the API refuses them and the fields aren't rendered.
 */
function MarginEditor({ corp, rep, onSaved }: { corp: MarginSpec; rep: MarginSpec; onSaved: () => Promise<void> }) {
  const [corpDraft, setCorpDraft] = useState<MarginSpec>(corp)
  const [repDraft, setRepDraft] = useState<MarginSpec>(rep)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setCorpDraft(corp); setRepDraft(rep) }, [corp, rep])

  const dirty = corpDraft.type !== corp.type || corpDraft.value !== corp.value
    || repDraft.type !== rep.type || repDraft.value !== rep.value

  const save = async () => {
    for (const [label, m] of [['Corp', corpDraft], ['Rep', repDraft]] as const) {
      if (m.type === 'percent' && (m.value < 0 || m.value > 1)) {
        toast.error(`${label} margin must be between 0% and 100%`); return
      }
      if (m.type === 'fixed' && m.value < 0) { toast.error(`${label} margin cannot be negative`); return }
    }
    setSaving(true)
    try {
      const res = await fetch('/api/var/margins', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpMargin: corpDraft, repMargin: repDraft }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to save margins')
      toast.success('Margins saved')
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save margins')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        Set your own corp and rep margins. Percent margins are a share of the deal (enter 12.5 for
        12.5%); fixed margins are a dollar amount per deal.
      </p>
      <MarginInput label="Corp margin" value={corpDraft} onChange={setCorpDraft} />
      <MarginInput label="Rep margin" value={repDraft} onChange={setRepDraft} />
      <Button size="sm" onClick={save} disabled={saving || !dirty}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save margins
      </Button>
    </div>
  )
}

function MarginInput({ label, value, onChange }: { label: string; value: MarginSpec; onChange: (m: MarginSpec) => void }) {
  // Percent margins are stored as a fraction (0.125) but typed as a percentage (12.5).
  const shown = value.type === 'percent' ? Number((value.value * 100).toFixed(4)) : value.value
  return (
    <div className="grid grid-cols-[1fr_120px_120px] items-end gap-2">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value.type}
        onValueChange={(t) => onChange({ type: t as MarginSpec['type'], value: 0 })}
      >
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="percent">Percent</SelectItem>
          <SelectItem value="fixed">Fixed $</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="number" min={0} step={value.type === 'percent' ? 0.1 : 1} className="h-9"
        value={Number.isFinite(shown) ? shown : ''}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isFinite(n)) return
          onChange({ type: value.type, value: value.type === 'percent' ? n / 100 : n })
        }}
      />
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
