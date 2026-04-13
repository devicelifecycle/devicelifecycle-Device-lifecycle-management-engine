'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, FileUp, FilePlus2, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useOrders } from '@/hooks/useOrders'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { toast } from 'sonner'

type ParsedRow = {
  make: string; model: string; storage: string; condition: string
  quantity: number; unit_price: number | null
  serials: string[]; imeis: string[]
  device_id: string | null; match_status: string
}
type ParseSummary = {
  total_devices: number; matched: number; unmatched: number
  total_value: number | null; format_type: string; llm_assisted: boolean
}

export default function CustomerRequestsPage() {
  const router = useRouter()
  const { orders, isLoading } = useOrders({
    page: 1,
    page_size: 5,
    type: 'trade_in',
    sort_by: 'updated_at',
    sort_order: 'desc',
  })

  // ── Upload state ────────────────────────────────────────────────────────────
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [parsedSummary, setParsedSummary] = useState<ParseSummary | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch own customer ID on mount (scoped to logged-in customer's org)
  useEffect(() => {
    fetch('/api/customers?page_size=1')
      .then(r => r.json())
      .then(d => { const first = d.data?.[0]; if (first?.id) setCustomerId(first.id) })
      .catch(() => {})
  }, [])

  async function handleFileSelect(file: File) {
    setUploadFile(file)
    setParsedRows([])
    setParsedSummary(null)
    setParseError('')
    setParsing(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/orders/parse-trade-template', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to read file')
      setParsedRows(data.rows || [])
      setParsedSummary(data.summary || null)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read file. Please check the format.')
    } finally {
      setParsing(false)
    }
  }

  async function handleSubmit() {
    if (!customerId) { toast.error('Customer profile not found. Please refresh and try again.'); return }
    const matchedRows = parsedRows.filter(r => r.device_id)
    if (matchedRows.length === 0) { toast.error('No recognizable devices found in your file.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'trade_in',
          customer_id: customerId,
          items: matchedRows.map(r => ({
            device_id: r.device_id,
            quantity: r.quantity,
            storage: r.storage,
            condition: r.condition,
            notes: r.serials.length > 0
              ? `Serials: ${r.serials.join(', ')}`
              : r.imeis.length > 0
                ? `IMEIs: ${r.imeis.join(', ')}`
                : undefined,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')
      toast.success('Request submitted! We\'ll send your quote within 24 hours.')
      setUploadFile(null)
      setParsedRows([])
      setParsedSummary(null)
      if (data.data?.id) router.push(`/orders/${data.data.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const matchedCount = parsedRows.filter(r => r.device_id).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
        <p className="text-muted-foreground mt-1">Create and review trade-in requests.</p>
      </div>

      {/* Upload your device list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Your Device List</CardTitle>
          <CardDescription>
            Have a spreadsheet of devices? Upload it and we&apos;ll prepare your quote automatically — no manual entry needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File drop zone */}
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted px-6 py-8 cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {parsing ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <FileUp className="h-8 w-8 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground text-center">
              {parsing
                ? 'Reading your file…'
                : uploadFile
                  ? uploadFile.name
                  : 'Click to upload your device list (Excel or CSV)'}
            </p>
            {uploadFile && !parsing && (
              <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024).toFixed(1)} KB</p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = '' }}
            />
          </div>

          {/* Parse error */}
          {parseError && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />{parseError}
            </p>
          )}

          {/* Parsed preview */}
          {parsedSummary && parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className={`rounded-md border px-4 py-3 text-sm ${matchedCount === parsedRows.length ? 'border-green-200 bg-green-50/40 text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400' : 'border-amber-200 bg-amber-50/40 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400'}`}>
                <span className="font-semibold">{parsedSummary.total_devices} devices detected</span>
                {parsedSummary.total_value != null && <span> · Estimated value: {formatCurrency(parsedSummary.total_value)}</span>}
                {matchedCount < parsedRows.length && (
                  <span className="ml-1">· {parsedRows.length - matchedCount} SKU{parsedRows.length - matchedCount !== 1 ? 's' : ''} unrecognized (will be reviewed manually)</span>
                )}
              </div>

              <div className="rounded-lg border divide-y text-sm overflow-hidden">
                {parsedRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{row.make} {row.model}</span>
                      {row.storage && <span className="ml-1 text-xs text-muted-foreground">({row.storage})</span>}
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">{row.condition}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">×{row.quantity}</span>
                    {row.unit_price != null && (
                      <span className="text-xs tabular-nums">{formatCurrency(row.unit_price)}/unit</span>
                    )}
                    {row.device_id ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button variant="success" onClick={handleSubmit} disabled={submitting || matchedCount === 0}>
                  {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {submitting ? 'Submitting…' : `Submit Trade-In Request (${matchedCount} device${matchedCount !== 1 ? 's' : ''})`}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual creation options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Manually</CardTitle>
          <CardDescription>Start a new request or view existing orders.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/orders/new">
            <Button>
              <FilePlus2 className="mr-2 h-4 w-4" />
              New Order
            </Button>
          </Link>
          <Link href="/customer/orders">
            <Button variant="outline">
              View My Orders
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent requests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Requests</CardTitle>
          <CardDescription>Latest trade-in activity</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => (
                <div key={index} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10">
              <ClipboardList className="mx-auto h-9 w-9 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">No requests yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">Updated {formatRelativeTime(order.updated_at || order.created_at)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
