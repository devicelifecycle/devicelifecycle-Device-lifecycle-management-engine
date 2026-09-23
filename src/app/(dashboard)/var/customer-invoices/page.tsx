'use client'

// ============================================================================
// VAR — CUSTOMER INVOICES (Billing Option B)
// ============================================================================
// Only meaningful for a VAR whose billing mode is "in_platform". When it isn't,
// the API answers 409 and this page explains how to turn it on rather than
// showing an empty table that looks broken.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { FileText, Loader2, Plus, Send, Ban, Wallet } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatCurrency, formatDateTime } from '@/lib/utils'

interface Balance { paid: number; refunded: number; netPaid: number; balance: number; settled: boolean }
interface Invoice {
  id: string
  customer_id: string
  invoice_number: string | null
  status: 'draft' | 'sent' | 'paid' | 'void'
  issue_date: string
  due_date: string | null
  subtotal: number
  tax_amount: number
  tax_label: string | null
  total: number
  currency: string
  sent_at: string | null
  customer?: { company_name?: string } | { company_name?: string }[] | null
  balance: Balance
}

interface CustomerOption { id: string; company_name: string }

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-700',
}

function companyName(c: Invoice['customer']): string {
  if (!c) return '—'
  const row = Array.isArray(c) ? c[0] : c
  return row?.company_name ?? '—'
}

export default function VarCustomerInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modeOff, setModeOff] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [dueDays, setDueDays] = useState('30')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/var/customer-invoices')
      const j = await res.json().catch(() => ({}))
      if (res.status === 409) { setModeOff(true); return }
      if (!res.ok) throw new Error(j?.error || 'Failed to load invoices')
      setModeOff(false)
      setInvoices(j.data ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void fetch('/api/customers?limit=200')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCustomers((j?.data ?? []).map((c: { id: string; company_name: string }) => ({ id: c.id, company_name: c.company_name }))))
      .catch(() => {})
  }, [load])

  const create = async () => {
    if (!customerId) { toast.error('Pick a customer'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/var/customer-invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, due_days: Number(dueDays) || 30 }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to create invoice')
      toast.success(`Invoice ${j.data.invoice_number} created from ${j.data.lines.length} order(s)`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create invoice')
    } finally {
      setCreating(false)
    }
  }

  const act = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/var/customer-invoices/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Action failed')
      toast.success(okMsg)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  const recordPayment = (inv: Invoice) => {
    const raw = window.prompt(`Amount received for ${inv.invoice_number}? Outstanding: ${formatCurrency(inv.balance.balance, inv.currency)}`)
    if (raw === null) return
    const amount = Number(raw)
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter a positive amount'); return }
    void act(inv.id, { action: 'record_payment', amount }, 'Payment recorded')
  }

  if (modeOff) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><FileText className="h-6 w-6 text-primary" /> Customer Invoices</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">You bill your customers outside the platform</CardTitle>
            <CardDescription>
              Your organization is set to Option A: you raise invoices in your own system, and Byte-Back
              invoices you separately for commission. Nothing here is missing — this page is simply not in use.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            To raise and track customer invoices here instead, open the{' '}
            <Link href="/var" className="text-primary hover:underline">VAR Console</Link> and change
            &ldquo;How you bill your customers&rdquo; to Option B.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><FileText className="h-6 w-6 text-primary" /> Customer Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invoices you issue to your own customers, built from their completed orders. Payments are
          recorded by hand — card collection isn&apos;t part of the platform yet.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> New invoice</CardTitle>
          <CardDescription>Bills every completed order for that customer that isn&apos;t on an invoice yet, with their regional tax applied.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Due in (days)</Label>
              <Input type="number" min={0} max={365} value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
            </div>
            <Button onClick={create} disabled={creating}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create invoice
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : invoices.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Invoice</th>
                  <th className="pb-2 pr-4 font-medium">Customer</th>
                  <th className="pb-2 pr-4 font-medium">Issued</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium text-right">Total</th>
                  <th className="pb-2 pr-4 font-medium text-right">Outstanding</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs">{inv.invoice_number ?? '—'}</td>
                      <td className="py-3 pr-4 font-medium">{companyName(inv.customer)}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDateTime(inv.issue_date)}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[inv.status] ?? 'bg-muted'}`}>{inv.status}</span>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">{formatCurrency(inv.total, inv.currency)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{formatCurrency(inv.balance.balance, inv.currency)}</td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {inv.status === 'draft' && (
                            <Button size="sm" variant="outline" disabled={busyId === inv.id}
                              onClick={() => act(inv.id, { action: 'send' }, 'Invoice marked as sent')}>
                              <Send className="mr-1 h-3.5 w-3.5" /> Send
                            </Button>
                          )}
                          {inv.status !== 'void' && inv.balance.balance > 0 && (
                            <Button size="sm" variant="outline" disabled={busyId === inv.id} onClick={() => recordPayment(inv)}>
                              <Wallet className="mr-1 h-3.5 w-3.5" /> Payment
                            </Button>
                          )}
                          {inv.status !== 'void' && inv.status !== 'paid' && (
                            <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" disabled={busyId === inv.id}
                              onClick={() => act(inv.id, { action: 'void' }, 'Invoice voided')}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
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
    </div>
  )
}
