'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, FileUp, FilePlus2, Loader2, FileCheck2 } from 'lucide-react'
import { CSV_COLUMN_ALIASES } from '@/lib/csv-templates'
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

const DRAFT_KEY = 'dlm_trade_draft'

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
  const [rowValidationErrors, setRowValidationErrors] = useState<{ row: number; message: string }[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadProgress, setUploadProgress] = useState(0) // 0 = no progress bar, 1-100 during large-file processing
  const [customerLoadError, setCustomerLoadError] = useState('')
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null)

  // Large-file threshold: files >5 MB are parsed in the browser to avoid
  // Vercel function timeout, then sent as pre-aggregated JSON for matching.
  const LARGE_FILE_BYTES = 5 * 1024 * 1024

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw) as { rows: ParsedRow[]; summary: ParseSummary; savedAt: string }
      if (Array.isArray(draft.rows) && draft.rows.length > 0) {
        setParsedRows(draft.rows)
        if (draft.summary) setParsedSummary(draft.summary)
        setDraftRestoredAt(draft.savedAt)
      }
    } catch { /* ignore parse errors */ }
  }, [])

  // Auto-save every 30s when rows are loaded
  useEffect(() => {
    if (parsedRows.length === 0) return
    const save = () => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          rows: parsedRows,
          summary: parsedSummary,
          savedAt: new Date().toISOString(),
        }))
      } catch { /* ignore storage errors */ }
    }
    const interval = setInterval(save, 30000)
    return () => clearInterval(interval)
  }, [parsedRows, parsedSummary])

  // Fetch own customer ID on mount — /me is scoped to the logged-in customer's org
  useEffect(() => {
    fetch('/api/customers/me')
      .then(r => r.json())
      .then(d => {
        if (d?.id) setCustomerId(d.id)
        else setCustomerLoadError(d?.error || 'Your account is not linked to an organization. Please contact your administrator.')
      })
      .catch(() => setCustomerLoadError('Could not load your account. Please refresh the page.'))
  }, [])

  async function handleFileSelect(file: File) {
    setUploadFile(file)
    setParsedRows([])
    setParsedSummary(null)
    setParseError('')
    setUploadProgress(0)
    setDraftRestoredAt(null)
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    setParsing(true)
    try {
      if (file.size > LARGE_FILE_BYTES) {
        await handleLargeFile(file)
      } else {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/orders/parse-trade-template', { method: 'POST', body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to read file')
        const rows: ParsedRow[] = data.rows || []
        const summary: ParseSummary | null = data.summary || null
        setParsedRows(rows)
        setParsedSummary(summary)
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows, summary, savedAt: new Date().toISOString() }))
        } catch { /* ignore */ }
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read file. Please check the format.')
    } finally {
      setParsing(false)
      setUploadProgress(0)
    }
  }

  // Parse a large file entirely in the browser, aggregate rows by SKU, then
  // send pre-aggregated rows to the server for device matching only.
  // This avoids any Vercel function timeout regardless of row count.
  async function handleLargeFile(file: File) {
    setUploadProgress(5)
    // Dynamic import keeps ExcelJS out of the initial page bundle — it only
    // loads when the user actually uploads a file larger than LARGE_FILE_BYTES.
    const { parseTabularUpload } = await import('@/lib/csv-templates')
    const { headers, rows: rawRows } = await parseTabularUpload(file)
    if (rawRows.length === 0) throw new Error('No data found in file.')
    setUploadProgress(30)

    // Map each header to its canonical column name using the shared alias table
    const colMap: Record<string, string> = {}
    for (const header of headers) {
      const alias = CSV_COLUMN_ALIASES[header.toLowerCase().trim()]
      if (alias) colMap[header] = alias
    }

    // Helper: find the first header that maps to the given canonical column
    const getVal = (row: Record<string, string>, canonical: string): string => {
      for (const [header, mapped] of Object.entries(colMap)) {
        if (mapped === canonical && row[header] !== undefined) return row[header].trim()
      }
      return ''
    }

    // Aggregate rows by (make, model, storage, condition) — reduces 100k IMEI
    // rows to a handful of unique SKUs before sending to the server.
    const aggMap = new Map<string, { make: string; model: string; storage: string; condition: string; quantity: number; imeis: string[]; serials: string[] }>()

    for (const row of rawRows) {
      const make = getVal(row, 'device_make')
      const model = getVal(row, 'device_model')
      if (!make && !model) continue

      const storage = getVal(row, 'storage')
      const condition = getVal(row, 'condition') || 'good'
      const qtyRaw = getVal(row, 'quantity')
      const quantity = parseInt(qtyRaw, 10) || 1
      const rawSerial = getVal(row, 'serial_number')
      const isImei = /^\d{15}$/.test(rawSerial)

      const key = `${make.toLowerCase()}|${model.toLowerCase()}|${storage.toLowerCase()}|${condition.toLowerCase()}`
      const existing = aggMap.get(key)
      if (existing) {
        existing.quantity += quantity
        if (rawSerial) (isImei ? existing.imeis : existing.serials).push(rawSerial)
      } else {
        aggMap.set(key, {
          make, model, storage, condition, quantity,
          imeis: rawSerial && isImei ? [rawSerial] : [],
          serials: rawSerial && !isImei ? [rawSerial] : [],
        })
      }
    }
    setUploadProgress(60)

    const aggregated = Array.from(aggMap.values())
    if (aggregated.length === 0) throw new Error('No device rows found. Check that your file has Make/Model columns.')

    // Send aggregated rows as JSON — server does device matching + auto-add only
    const res = await fetch('/api/orders/parse-trade-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: aggregated }),
    })
    setUploadProgress(90)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to match devices')

    const rows: ParsedRow[] = data.rows || []
    const summary: ParseSummary | null = data.summary || null
    setParsedRows(rows)
    setParsedSummary(summary)
    setUploadProgress(100)
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows, summary, savedAt: new Date().toISOString() }))
    } catch { /* ignore */ }
  }

  async function handleSubmit(skipInvalidRows = false) {
    if (!customerId) { toast.error('Customer profile not found. Please refresh and try again.'); return }
    if (parsedRows.length === 0) { toast.error('No devices found in your file.'); return }
    setSubmitting(true)
    setRowValidationErrors(null)
    try {
      // Route ALL rows (matched + unmatched) through upload-csv so antiquated/unlisted
      // devices are still submitted — COE team can manually identify and link them.
      const rawRows = parsedRows.map(r => ({
        make: r.make,
        model: r.model,
        storage: r.storage || '',
        condition: r.condition || 'good',
        quantity: String(r.quantity),
        // Pass parse-step device_id so upload-csv skips its weaker ILIKE re-match
        // and uses the deterministic exact/prefix match result from parse-trade-template.
        ...(r.device_id ? { device_id: r.device_id } : {}),
        ...(r.imeis.length > 0 ? { imei: r.imeis.join(', ') } : {}),
        ...(r.serials.length > 0 ? { serial_number: r.serials.join(', ') } : {}),
      }))
      const res = await fetch('/api/orders/upload-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rawRows, customer_id: customerId, order_type: 'trade_in', ...(skipInvalidRows ? { skip_invalid_rows: true } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Show row-level validation errors with an override option
        if (res.status === 400 && Array.isArray(data.details) && data.details.length > 0) {
          setRowValidationErrors(data.details)
          return
        }
        throw new Error(data.error || 'Submission failed')
      }
      const total = parsedRows.length
      const matched = data.items_created ?? total
      const skipped = data.skipped_rows ?? 0
      const msg = skipped > 0
        ? `Request submitted — ${matched} device${matched !== 1 ? 's' : ''} processed, ${skipped} row${skipped !== 1 ? 's' : ''} skipped.`
        : `Request submitted — ${matched} of ${total} device${total !== 1 ? 's' : ''} processed. We'll send your quote within 24 hours.`
      toast.success(msg)
      setUploadFile(null)
      setParsedRows([])
      setParsedSummary(null)
      setRowValidationErrors(null)
      setDraftRestoredAt(null)
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      if (data.order?.id) router.push(`/customer/orders/${data.order.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const matchedCount = parsedRows.filter(r => r.device_id).length
  const autoAddedCount = parsedRows.filter(r => r.match_status === 'auto_added').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Requests</h1>
        <p className="text-muted-foreground mt-1">Create and review trade-in requests.</p>
      </div>

      {/* Account setup error */}
      {customerLoadError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{customerLoadError}</span>
        </div>
      )}

      {/* Upload your device list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Your Device List</CardTitle>
          <CardDescription>
            Have a spreadsheet of devices? Upload it and we&apos;ll prepare your quote automatically — no manual entry needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Draft restored banner */}
          {draftRestoredAt && parsedRows.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-400">
              <span>
                <span className="font-medium">Draft restored</span> — {parsedRows.length} device{parsedRows.length !== 1 ? 's' : ''} from {formatRelativeTime(draftRestoredAt)}. Upload a new file to replace.
              </span>
              <button
                onClick={() => {
                  setParsedRows([])
                  setParsedSummary(null)
                  setDraftRestoredAt(null)
                  try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
                }}
                className="text-xs text-blue-600 hover:text-blue-800 underline shrink-0 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Clear
              </button>
            </div>
          )}

          {/* File drop zone */}
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted px-6 py-8 cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {parsing ? (
              uploadProgress > 0
                ? <FileCheck2 className="h-8 w-8 text-primary" />
                : <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <FileUp className="h-8 w-8 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground text-center">
              {parsing
                ? uploadProgress > 0
                  ? `Processing… ${uploadProgress}%`
                  : 'Reading your file…'
                : uploadFile
                  ? uploadFile.name
                  : 'Click to upload your device list (Excel or CSV)'}
            </p>
            {uploadFile && !parsing && (
              <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024).toFixed(1)} KB</p>
            )}
            {parsing && uploadProgress > 0 && (
              <div className="w-full max-w-xs h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods"
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
              <div className={`rounded-md border px-4 py-3 text-sm space-y-1 ${matchedCount === parsedRows.length ? 'border-green-200 bg-green-50/40 text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400' : 'border-amber-200 bg-amber-50/40 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400'}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {parsedSummary.total_devices} device{parsedSummary.total_devices !== 1 ? 's' : ''} across {parsedRows.length} SKU{parsedRows.length !== 1 ? 's' : ''} detected
                  </span>
                  {parsedSummary.format_type !== 'unknown' && (
                    <span className="text-xs opacity-70 capitalize">{parsedSummary.format_type === 'per_device' ? 'per-device manifest' : 'batch format'}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs opacity-80">
                  <span>{matchedCount}/{parsedRows.length} SKUs matched in catalog</span>
                  {parsedSummary.total_value != null && <span>Estimated value: {formatCurrency(parsedSummary.total_value)}</span>}
                  {autoAddedCount > 0 && <span>{autoAddedCount} new device{autoAddedCount !== 1 ? 's' : ''} added to catalog</span>}
                  {matchedCount < parsedRows.length && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">{parsedRows.length - matchedCount} unmatched SKU{parsedRows.length - matchedCount !== 1 ? 's' : ''} will be submitted for manual review</span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border divide-y text-sm overflow-hidden">
                {parsedRows.map((row, idx) => (
                  <div key={idx} className={`flex items-center gap-2 px-4 py-2.5 ${!row.device_id ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{row.make} {row.model}</span>
                      <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{row.quantity} unit{row.quantity !== 1 ? 's' : ''}</span>
                    </div>
                    <input
                      type="text"
                      value={row.storage}
                      onChange={e => setParsedRows(prev => prev.map((r, i) => i === idx ? { ...r, storage: e.target.value } : r))}
                      placeholder="Storage"
                      className="w-20 rounded border border-input bg-background px-1.5 py-0.5 text-xs text-center"
                    />
                    <select
                      value={row.condition}
                      onChange={e => setParsedRows(prev => prev.map((r, i) => i === idx ? { ...r, condition: e.target.value } : r))}
                      className="rounded border border-input bg-background px-1 py-0.5 text-xs"
                    >
                      {['excellent', 'good', 'fair', 'poor', 'broken'].map(c => (
                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={row.quantity}
                      onChange={e => setParsedRows(prev => prev.map((r, i) => i === idx ? { ...r, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : r))}
                      className="w-14 rounded border border-input bg-background px-1.5 py-0.5 text-xs text-center"
                      title="Quantity"
                    />
                    {row.unit_price != null && (
                      <span className="text-xs tabular-nums shrink-0">{formatCurrency(row.unit_price)}/unit</span>
                    )}
                    {row.device_id ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              {rowValidationErrors && rowValidationErrors.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400 space-y-2">
                  <p className="font-semibold flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {rowValidationErrors.length} row{rowValidationErrors.length !== 1 ? 's' : ''} have errors:
                  </p>
                  <ul className="ml-6 list-disc space-y-0.5 text-xs">
                    {rowValidationErrors.slice(0, 5).map((e, i) => (
                      <li key={i}>Row {e.row}: {e.message}</li>
                    ))}
                    {rowValidationErrors.length > 5 && <li>…and {rowValidationErrors.length - 5} more</li>}
                  </ul>
                  <p className="text-xs">Fix your file and re-upload, or skip these rows and submit the rest.</p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                {rowValidationErrors && rowValidationErrors.length > 0 && (
                  <Button variant="outline" onClick={() => handleSubmit(true)} disabled={submitting}>
                    {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Skip invalid rows &amp; submit rest
                  </Button>
                )}
                <Button variant="success" onClick={() => handleSubmit(false)} disabled={submitting || parsedRows.length === 0}>
                  {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {submitting ? 'Submitting…' : `Submit Trade-In Request (${parsedRows.length} device${parsedRows.length !== 1 ? 's' : ''})`}
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
                  href={`/customer/orders/${order.id}`}
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
