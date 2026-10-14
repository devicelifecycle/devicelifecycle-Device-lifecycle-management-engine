'use client'

// ============================================================================
// VAR BILLING PORTAL — VARs view their invoices, subscription, and payments
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { CreditCard, Download, FileText, Loader2, Receipt, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useCan } from '@/hooks/useCan'

interface Invoice {
  id: string
  invoice_number: string | null
  period_start: string
  period_end: string
  status: 'draft' | 'sent' | 'paid' | 'void'
  total: number
  currency: string
  sent_at: string | null
  paid_at: string | null
  created_at: string
}

interface Subscription {
  id: string
  plan_slug: string
  status: string
  billing_interval: string
  current_period_start: string
  current_period_end: string
  trial_ends_at: string | null
  past_due_since: string | null
}

interface Payment {
  id: string
  invoice_id: string
  amount: number
  type: string
  note: string | null
  created_at: string
}

interface BillingData {
  invoices: Invoice[]
  subscription: Subscription | null
  payments: Payment[]
  summary: { totalInvoices: number; outstanding: number; paid: number }
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  void: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

const SUB_STATUS_STYLES: Record<string, string> = {
  trialing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  past_due: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  cancelled: 'bg-muted text-muted-foreground',
  expired: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

export default function VarBillingPage() {
  const { can } = useCan()
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/var/billing')
      if (!res.ok) throw new Error('Failed to load billing')
      const json = await res.json()
      setData(json.data)
    } catch {
      toast.error('Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Unable to load billing data.
      </div>
    )
  }

  const { invoices, subscription, payments, summary } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Your billing relationship with the platform. See outstanding and paid invoice totals, your current subscription status (active, trial, or past due), and a full history of payments. Download invoice PDFs for your records. If your subscription is past due, a warning shows how many grace days remain before read only mode kicks in.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary.outstanding)}</p>
            <p className="text-xs text-muted-foreground">Unpaid invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary.paid)}</p>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Invoices</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.totalInvoices}</p>
            <p className="text-xs text-muted-foreground">Total issued</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscription status */}
      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Subscription
            </CardTitle>
            <CardDescription>Your current plan and billing period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Plan</p>
                <p className="font-semibold capitalize">{subscription.plan_slug.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={SUB_STATUS_STYLES[subscription.status] ?? ''}>
                  {subscription.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Billing</p>
                <p className="font-semibold capitalize">{subscription.billing_interval}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current period</p>
                <p className="text-sm">
                  {formatDate(subscription.current_period_start)} – {formatDate(subscription.current_period_end)}
                </p>
              </div>
            </div>
            {subscription.past_due_since && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                <AlertTriangle className="mr-1.5 inline-block h-4 w-4" />
                Payment is overdue since {formatDate(subscription.past_due_since)}. Please contact support to avoid service interruption.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invoices table */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>All invoices issued to your organization</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">
                        {inv.invoice_number || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[inv.status] ?? ''}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(inv.total)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.sent_at ? formatDate(inv.sent_at) : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.paid_at ? formatDate(inv.paid_at) : '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => window.open(`/api/var/billing/${inv.id}/pdf`, '_blank')}
                          title="Download PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      {payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>Payments and refunds recorded against your invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{formatDate(p.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant={p.type === 'refund' ? 'destructive' : 'default'}>
                          {p.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.note || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
