'use client'

// ============================================================================
// ADMIN — BILLING (BB ↔ VAR invoices)
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Calculator, Loader2, Plus, Receipt, Wallet } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { canTransitionInvoice, type InvoiceStatus } from '@/lib/billing'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const NEXT_ACTIONS: Array<{ to: InvoiceStatus; label: string }> = [
  { to: 'sent', label: 'Mark sent' },
  { to: 'paid', label: 'Mark paid' },
  { to: 'void', label: 'Void' },
]

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
  const [recTenantId, setRecTenantId] = useState('')
  const [recStart, setRecStart] = useState('')
  const [recEnd, setRecEnd] = useState('')
  const [reconciling, setReconciling] = useState(false)
  const [reconcileResult, setReconcileResult] = useState<{ invoice_number: string; orders_count: number; total_commission: number } | null>(null)
  const [paymentsTarget, setPaymentsTarget] = useState<Invoice | null>(null)

  const load = useCallback(async () => {
    try {
      const [invRes, tenRes] = await Promise.all([
        fetch('/api/admin/billing'),
        fetch('/api/admin/tenants?type=var&limit=200'),
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

  const reconcile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recTenantId || !recStart || !recEnd) { toast.error('Pick a VAR and a period'); return }
    setReconciling(true)
    setReconcileResult(null)
    try {
      const res = await fetch('/api/admin/billing/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: recTenantId, period_start: recStart, period_end: recEnd }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to reconcile period')
      setReconcileResult(j.data)
      toast.success(`Commission invoice ${j.data.invoice_number} created (${j.data.orders_count} orders)`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reconcile period')
    } finally {
      setReconciling(false)
    }
  }

  const transition = async (id: string, to: InvoiceStatus) => {
    try {
      const res = await fetch(`/api/admin/billing/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to update invoice')
      toast.success(`Invoice marked ${to}`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update invoice')
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
          <CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4" /> Reconcile period</CardTitle>
          <CardDescription>Aggregates a VAR's payment-sent and closed orders in the period into one draft commission invoice. Re-running the same VAR + period returns the existing invoice.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={reconcile} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">VAR</Label>
              <Select value={recTenantId} onValueChange={setRecTenantId}>
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
              <Input type="date" value={recStart} onChange={(e) => setRecStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Period end</Label>
              <Input type="date" value={recEnd} onChange={(e) => setRecEnd(e.target.value)} />
            </div>
            <Button type="submit" disabled={reconciling} className="sm:col-span-2 lg:col-span-3 lg:w-auto lg:justify-self-start">
              {reconciling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
              Reconcile period
            </Button>
          </form>
          {reconcileResult && (
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
              Created draft <span className="font-mono text-xs">{reconcileResult.invoice_number}</span> — {reconcileResult.orders_count} order(s), commission total{' '}
              <span className="font-medium tabular-nums">{formatCurrency(reconcileResult.total_commission)}</span>.
            </p>
          )}
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
                    <th className="pb-2 pr-4 font-medium text-right">Total</th>
                    <th className="pb-2 font-medium text-right">Actions</th>
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
                      <td className="py-3 pr-4 text-right font-medium tabular-nums">{formatCurrency(inv.total, inv.currency)}</td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPaymentsTarget(inv)}>
                            <Wallet className="mr-1 h-3 w-3" /> Payments
                          </Button>
                          {NEXT_ACTIONS.filter((a) => canTransitionInvoice(inv.status as InvoiceStatus, a.to)).map((a) => (
                            <Button key={a.to} size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => transition(inv.id, a.to)}>
                              {a.label}
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {paymentsTarget && (
        <InvoicePaymentsDialog invoice={paymentsTarget} onClose={() => setPaymentsTarget(null)} onChanged={load} />
      )}
    </div>
  )
}
// ============================================================================
// INVOICE PAYMENTS — history, record a payment, refund
// ============================================================================
// Backed by GET/POST /api/admin/billing/[id]/payments. Recording a payment that
// clears the balance auto-marks a sent invoice paid server-side, so the
// invoice list refreshes after every change.

interface PaymentRow {
  id: string
  kind: 'payment' | 'refund'
  amount: number
  note: string | null
  created_at: string
}

interface PaymentSummaryShape {
  paid: number
  refunded: number
  net: number
  balance: number
  fullyPaid: boolean
}

function InvoicePaymentsDialog({ invoice, onClose, onChanged }: {
  invoice: Invoice
  onClose: () => void
  onChanged: () => void
}) {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [summary, setSummary] = useState<PaymentSummaryShape | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null)

  const loadPayments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/billing/${invoice.id}/payments`)
      if (!res.ok) throw new Error()
      const j = await res.json()
      setPayments(j.data.payments ?? [])
      setSummary(j.data.summary ?? null)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [invoice.id])

  useEffect(() => { void loadPayments() }, [loadPayments])

  const record = async (kind: 'payment' | 'refund', rawAmount: number, noteText?: string) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/billing/${invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, amount: rawAmount, ...(noteText ? { note: noteText } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || `Could not record ${kind}`)
      toast.success(kind === 'refund' ? 'Refund recorded' : 'Payment recorded')
      await loadPayments()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not record ${kind}`)
    } finally {
      setSubmitting(false)
    }
  }

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) { toast.error('Enter an amount greater than zero'); return }
    if (summary && value > summary.balance) { toast.error('Amount exceeds the balance due'); return }
    await record('payment', Math.round(value * 100) / 100, note.trim() || undefined)
    setAmount('')
    setNote('')
  }

  const refund = async (p: PaymentRow) => {
    setRefundTarget(null)
    await record('refund', p.amount, `Refund of payment from ${new Date(p.created_at).toLocaleDateString()}`)
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payments — {invoice.invoice_number ?? 'Invoice'}</DialogTitle>
          <DialogDescription>
            Total {formatCurrency(invoice.total, invoice.currency)}
            {summary ? ` · paid ${formatCurrency(summary.net, invoice.currency)} · balance ${formatCurrency(summary.balance, invoice.currency)}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading payments…</div>
        ) : loadFailed ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Unable to load payment history.</div>
        ) : (
          <>
            <div className="max-h-[30vh] overflow-y-auto">
              {payments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0">
                    <div className="min-w-0">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${p.kind === 'payment' ? STATUS_STYLES.paid : STATUS_STYLES.void}`}>
                        {p.kind}
                      </span>
                      <span className="ml-2 text-sm font-medium tabular-nums">{formatCurrency(p.amount, invoice.currency)}</span>
                      {p.note && <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.note}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                      {p.kind === 'payment' && (
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setRefundTarget(p)}>
                          Refund
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {summary && !summary.fullyPaid && (
              <form onSubmit={submitPayment} className="space-y-3 border-t pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount (balance due {formatCurrency(summary.balance, invoice.currency)})</Label>
                    <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Note (optional)</Label>
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Wire ref, cheque #…" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                    Record payment
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </DialogContent>

      <AlertDialog open={!!refundTarget} onOpenChange={(v) => { if (!v) setRefundTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {refundTarget && `A refund of ${formatCurrency(refundTarget.amount, invoice.currency)} will be recorded against this invoice.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => refundTarget && refund(refundTarget)}>Record refund</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
