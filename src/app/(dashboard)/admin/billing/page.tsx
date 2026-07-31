'use client'

// ============================================================================
// ADMIN — BILLING (BB ↔ VAR invoices)
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Receipt } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'

interface Invoice {
  id: string
  invoice_number: string | null
  period_start: string
  period_end: string
  status: string
  total: number
  currency: string
  tenants: { name: string; slug: string } | null
}

interface VarOption { id: string; name: string; type: string }

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-700',
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [vars, setVars] = useState<VarOption[]>([])
  const [loading, setLoading] = useState(true)
  const [tenantId, setTenantId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [fee, setFee] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const [invRes, tenRes] = await Promise.all([
        fetch('/api/admin/billing'),
        fetch('/api/admin/tenants'),
      ])
      if (invRes.ok) setInvoices((await invRes.json()).data ?? [])
      if (tenRes.ok) {
        const all: VarOption[] = (await tenRes.json()).data ?? []
        setVars(all.filter((t) => t.type === 'var'))
      }
    } catch {
      toast.error('Failed to load billing')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId || !periodStart || !periodEnd) { toast.error('Pick a VAR and a period'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          period_start: periodStart,
          period_end: periodEnd,
          subscription_fee: fee ? Number(fee) : 0,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to create invoice')
      toast.success(`Draft ${j.data.invoice_number} created`)
      setFee('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Receipt className="h-6 w-6 text-primary" /> Billing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invoices Byte-Back issues to VAR tenants. A draft charges the flat subscription fee;
          deal commission is reconciled against the period&apos;s orders.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> New draft invoice</CardTitle>
          <CardDescription>Provisions a draft for a VAR and billing period.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">VAR</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger><SelectValue placeholder="Select VAR" /></SelectTrigger>
                <SelectContent>
                  {vars.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No VARs yet</div>
                  ) : vars.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Period start</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Period end</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subscription fee</Label>
              <Input type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.00" />
            </div>
            <Button type="submit" disabled={creating} className="sm:col-span-2 lg:col-span-4 lg:w-auto lg:justify-self-start">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create draft
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
          <CardDescription>{loading ? 'Loading…' : `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…
            </div>
          ) : invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Invoice</th>
                    <th className="pb-2 pr-4 font-medium">VAR</th>
                    <th className="pb-2 pr-4 font-medium">Period</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs">{inv.invoice_number ?? '—'}</td>
                      <td className="py-3 pr-4 font-medium">{inv.tenants?.name ?? '—'}</td>
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
