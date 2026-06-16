'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardList, Download, FileSpreadsheet, FileUp, FilePlus2,
  Loader2, FileCheck2, Clock, Package, BadgeCheck, Truck, CreditCard,
} from 'lucide-react'
import { CSV_COLUMN_ALIASES, CPO_CSV_HEADERS, CPO_CSV_SAMPLE, TRADE_IN_CSV_HEADERS, TRADE_IN_CSV_SAMPLE, buildCsvContent, buildXlsxTemplateBlob } from '@/lib/csv-templates'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useOrders } from '@/hooks/useOrders'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { toast } from 'sonner'

type ParsedRow = {
  make: string; model: string; storage: string; condition: string
  quantity: number; unit_price: number | null
  serials: string[]; imeis: string[]
  device_id: string | null; match_status: string
  upload_notes?: string
}
type ParseSummary = {
  total_devices: number; matched: number; unmatched: number
  total_value: number | null; format_type: string; llm_assisted: boolean
}

const DRAFT_KEY = 'dlm_trade_draft'
const PAGE_SIZE = 25

// ── Workflow steps shown in the timeline banner ───────────────────────────────
const WORKFLOW_STEPS = [
  { icon: FileUp,      label: 'Upload',   desc: 'Submit your device list' },
  { icon: Clock,       label: 'Review',   desc: 'We verify & price within 24 h' },
  { icon: BadgeCheck,  label: 'Quote',    desc: 'Accept or decline online' },
  { icon: Truck,       label: 'Ship',     desc: 'Send devices to our facility' },
  { icon: CreditCard,  label: 'Payment',  desc: 'Receive payment in 2–3 days' },
]

export default function CustomerRequestsPage() {
  const router = useRouter()
  const { orders, isLoading } = useOrders({
    page: 1, page_size: 5, type: 'trade_in', sort_by: 'updated_at', sort_order: 'desc',
  })

  // ── Trade-In upload state ─────────────────────────────────────────────────
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [parsedSummary, setParsedSummary] = useState<ParseSummary | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [rowValidationErrors, setRowValidationErrors] = useState<{ row: number; message: string }[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [customerLoadError, setCustomerLoadError] = useState('')
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null)
  const [tradePage, setTradePage] = useState(1)

  const [isDraggingTrade, setIsDraggingTrade] = useState(false)
  const [isDraggingCpo, setIsDraggingCpo] = useState(false)

  // ── CPO upload state ──────────────────────────────────────────────────────
  const [cpoUploadFile, setCpoUploadFile] = useState<File | null>(null)
  const [cpoParsing, setCpoParsing] = useState(false)
  const [cpoParseError, setCpoParseError] = useState('')
  const [cpoParsedRows, setCpoParsedRows] = useState<ParsedRow[]>([])
  const [cpoParsedSummary, setCpoParsedSummary] = useState<ParseSummary | null>(null)
  const cpoFileInputRef = useRef<HTMLInputElement>(null)
  const [cpoPage, setCpoPage] = useState(1)

  const LARGE_FILE_BYTES = 5 * 1024 * 1024

  // Restore draft
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
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (parsedRows.length === 0) return
    const save = () => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows: parsedRows, summary: parsedSummary, savedAt: new Date().toISOString() })) } catch { /* ignore */ }
    }
    const interval = setInterval(save, 30000)
    return () => clearInterval(interval)
  }, [parsedRows, parsedSummary])

  useEffect(() => {
    fetch('/api/customers/me')
      .then(r => r.json())
      .then(d => {
        if (d?.id) setCustomerId(d.id)
        else setCustomerLoadError(d?.error || 'Your account is not linked to an organization. Please contact your administrator.')
      })
      .catch(() => setCustomerLoadError('Could not load your account. Please refresh the page.'))
  }, [])

  // ── Template download helpers ─────────────────────────────────────────────
  function handleDownloadTradeTemplate() {
    const csv = buildCsvContent(TRADE_IN_CSV_HEADERS, TRADE_IN_CSV_SAMPLE)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'trade-in-template.csv'; a.click(); URL.revokeObjectURL(url)
  }
  async function handleDownloadTradeExcelTemplate() {
    const blob = await buildXlsxTemplateBlob('Trade-In', TRADE_IN_CSV_HEADERS, TRADE_IN_CSV_SAMPLE)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'trade-in-template.xlsx'; a.click(); URL.revokeObjectURL(url)
  }
  function handleDownloadCpoTemplate() {
    const csv = buildCsvContent(CPO_CSV_HEADERS, CPO_CSV_SAMPLE)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'cpo-template.csv'; a.click(); URL.revokeObjectURL(url)
  }
  async function handleDownloadCpoExcelTemplate() {
    const blob = await buildXlsxTemplateBlob('CPO', CPO_CSV_HEADERS, CPO_CSV_SAMPLE)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'cpo-template.xlsx'; a.click(); URL.revokeObjectURL(url)
  }

  // ── CPO file parse ────────────────────────────────────────────────────────
  async function handleCpoFileSelect(file: File) {
    setCpoUploadFile(file); setCpoParsedRows([]); setCpoParsedSummary(null); setCpoParseError(''); setCpoParsing(true); setCpoPage(1)
    try {
      const form = new FormData(); form.append('file', file)
      const res = await fetch('/api/orders/parse-trade-template', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to read file')
      setCpoParsedRows(data.rows || []); setCpoParsedSummary(data.summary || null)
    } catch (err) {
      setCpoParseError(err instanceof Error ? err.message : 'Could not read file.')
    } finally { setCpoParsing(false) }
  }

  // ── Trade-In file parse ───────────────────────────────────────────────────
  async function handleFileSelect(file: File) {
    setUploadFile(file); setParsedRows([]); setParsedSummary(null); setParseError(''); setUploadProgress(0)
    setDraftRestoredAt(null); setTradePage(1)
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    setParsing(true)
    try {
      if (file.size > LARGE_FILE_BYTES) {
        await handleLargeFile(file)
      } else {
        const form = new FormData(); form.append('file', file)
        const res = await fetch('/api/orders/parse-trade-template', { method: 'POST', body: form })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to read file')
        const rows: ParsedRow[] = data.rows || []
        const summary: ParseSummary | null = data.summary || null
        setParsedRows(rows); setParsedSummary(summary)
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows, summary, savedAt: new Date().toISOString() })) } catch { /* ignore */ }
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read file.')
    } finally { setParsing(false); setUploadProgress(0) }
  }

  async function handleLargeFile(file: File) {
    setUploadProgress(5)
    const { parseTabularUpload } = await import('@/lib/csv-templates')
    const { headers, rows: rawRows } = await parseTabularUpload(file)
    if (rawRows.length === 0) throw new Error('No data found in file.')
    setUploadProgress(30)
    const colMap: Record<string, string> = {}
    for (const header of headers) {
      const alias = CSV_COLUMN_ALIASES[header.toLowerCase().trim()]
      if (alias) colMap[header] = alias
    }
    const getVal = (row: Record<string, string>, canonical: string): string => {
      for (const [header, mapped] of Object.entries(colMap)) {
        if (mapped === canonical && row[header] !== undefined) return row[header].trim()
      }
      return ''
    }
    const aggMap = new Map<string, { make: string; model: string; storage: string; condition: string; quantity: number; imeis: string[]; serials: string[] }>()
    for (const row of rawRows) {
      const make = getVal(row, 'device_make'); const model = getVal(row, 'device_model')
      if (!make && !model) continue
      const storage = getVal(row, 'storage'); const condition = getVal(row, 'condition') || 'good'
      const qtyRaw = getVal(row, 'quantity'); const parsedQtyNum = qtyRaw !== '' ? parseInt(qtyRaw, 10) : NaN
      const quantity = !isNaN(parsedQtyNum) ? Math.max(0, parsedQtyNum) : 1
      const rawSerial = getVal(row, 'serial_number'); const isImei = /^\d{15}$/.test(rawSerial)
      const key = `${make.toLowerCase()}|${model.toLowerCase()}|${storage.toLowerCase()}|${condition.toLowerCase()}`
      const existing = aggMap.get(key)
      if (existing) {
        existing.quantity += quantity
        if (rawSerial) (isImei ? existing.imeis : existing.serials).push(rawSerial)
      } else {
        aggMap.set(key, { make, model, storage, condition, quantity, imeis: rawSerial && isImei ? [rawSerial] : [], serials: rawSerial && !isImei ? [rawSerial] : [] })
      }
    }
    setUploadProgress(60)
    const aggregated = Array.from(aggMap.values())
    if (aggregated.length === 0) throw new Error('No device rows found.')
    const res = await fetch('/api/orders/parse-trade-template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: aggregated }) })
    setUploadProgress(90)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to match devices')
    const rows: ParsedRow[] = data.rows || []; const summary: ParseSummary | null = data.summary || null
    setParsedRows(rows); setParsedSummary(summary); setUploadProgress(100)
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows, summary, savedAt: new Date().toISOString() })) } catch { /* ignore */ }
  }

  // ── Attach original file to order (fire-and-forget) ─────────────────────
  async function attachFileToOrder(file: File, orderId: string) {
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('order_id', orderId)
      await fetch('/api/uploads/order-file', { method: 'POST', body: form })
    } catch { /* non-blocking — don't fail the order if file upload fails */ }
  }

  // ── Re-download the file that's currently loaded in state ─────────────────
  function handleRedownload(file: File) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url; a.download = file.name; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(skipInvalidRows = false) {
    if (!customerId) { toast.error('Customer profile not found. Please refresh.'); return }
    const hasTradeIn = parsedRows.length > 0; const hasCpo = cpoParsedRows.length > 0
    if (!hasTradeIn && !hasCpo) { toast.error('No devices found. Please upload a file first.'); return }
    setSubmitting(true); setRowValidationErrors(null)
    const toRows = (rows: ParsedRow[]) => rows.map(r => ({
      make: r.make, model: r.model, storage: r.storage || '',
      condition: r.condition || 'good', quantity: String(r.quantity),
      ...(r.device_id ? { device_id: r.device_id } : {}),
      ...(r.imeis.length > 0 ? { imei: r.imeis[0] } : {}),
      ...(r.serials.length > 0 ? { serial_number: r.serials[0] } : {}),
      ...(r.upload_notes ? { upload_notes: r.upload_notes } : {}),
    }))
    try {
      let firstOrderId: string | undefined; let totalSubmitted = 0
      if (hasTradeIn) {
        const res = await fetch('/api/orders/upload-csv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: toRows(parsedRows), customer_id: customerId, order_type: 'trade_in', ...(skipInvalidRows ? { skip_invalid_rows: true } : {}) }) })
        const data = await res.json()
        if (!res.ok) {
          if (res.status === 400 && Array.isArray(data.details) && data.details.length > 0) { setRowValidationErrors(data.details); return }
          throw new Error(data.error || 'Trade-in submission failed')
        }
        if (data.order?.id) {
          firstOrderId = data.order.id
          if (uploadFile) attachFileToOrder(uploadFile, data.order.id)
        }
        totalSubmitted += data.items_created ?? parsedRows.length
      }
      if (hasCpo) {
        const res = await fetch('/api/orders/upload-csv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: toRows(cpoParsedRows), customer_id: customerId, order_type: 'cpo' }) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'CPO submission failed')
        if (data.order?.id) {
          if (!firstOrderId) firstOrderId = data.order.id
          if (cpoUploadFile) attachFileToOrder(cpoUploadFile, data.order.id)
        }
        totalSubmitted += data.items_created ?? cpoParsedRows.length
      }
      const parts = [hasTradeIn ? `${parsedRows.length} trade-in` : '', hasCpo ? `${cpoParsedRows.length} CPO` : ''].filter(Boolean).join(' + ')
      toast.success(`Request submitted — ${parts} device${totalSubmitted !== 1 ? 's' : ''} processed. We'll send your quote within 24 hours.`)
      setUploadFile(null); setParsedRows([]); setParsedSummary(null); setRowValidationErrors(null); setDraftRestoredAt(null); setTradePage(1)
      setCpoUploadFile(null); setCpoParsedRows([]); setCpoParsedSummary(null); setCpoPage(1)
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      if (firstOrderId) router.push(`/customer/orders/${firstOrderId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed')
    } finally { setSubmitting(false) }
  }

  // ── Pagination helpers ────────────────────────────────────────────────────
  function paginatedRows(rows: ParsedRow[], page: number) {
    const start = (page - 1) * PAGE_SIZE
    return rows.slice(start, start + PAGE_SIZE)
  }
  function totalPages(rows: ParsedRow[]) { return Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) }

  const matchedCount = parsedRows.filter(r => r.device_id).length
  const zeroQtyCount = parsedRows.filter(r => r.quantity === 0).length

  // ── Paginated row editor ─────────────────────────────────────────────────
  function RowEditor({ rows, setRows, page, setPage, sectionColor }: {
    rows: ParsedRow[]
    setRows: (fn: (prev: ParsedRow[]) => ParsedRow[]) => void
    page: number
    setPage: (p: number) => void
    sectionColor: 'green' | 'blue'
  }) {
    const pages = totalPages(rows)
    const visible = paginatedRows(rows, page)
    const offset = (page - 1) * PAGE_SIZE
    return (
      <div className="space-y-2">
        <div className="rounded-lg border divide-y text-sm overflow-hidden">
          {visible.map((row, relIdx) => {
            const idx = offset + relIdx
            return (
              <div key={idx} className={`flex items-center gap-2 px-4 py-2.5 ${row.quantity === 0 ? 'bg-red-50/30 dark:bg-red-950/10' : !row.device_id ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{row.make} {row.model}</span>
                  <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{row.quantity} unit{row.quantity !== 1 ? 's' : ''}</span>
                </div>
                <input
                  type="text"
                  value={row.storage}
                  onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, storage: e.target.value } : r))}
                  placeholder="Storage"
                  className="w-20 rounded border border-input bg-background px-1.5 py-0.5 text-xs text-center"
                />
                <select
                  value={row.condition}
                  onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, condition: e.target.value } : r))}
                  className="rounded border border-input bg-background px-1 py-0.5 text-xs"
                >
                  {['excellent', 'good', 'fair', 'poor', 'broken'].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
                <input
                  type="number" min="0"
                  value={row.quantity}
                  onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, quantity: Math.max(0, parseInt(e.target.value, 10) || 0) } : r))}
                  className={`w-14 rounded border px-1.5 py-0.5 text-xs text-center bg-background ${row.quantity === 0 ? 'border-red-400 text-red-600' : 'border-input'}`}
                  title="Quantity"
                />
                {row.quantity === 0 && (
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-medium shrink-0 whitespace-nowrap">qty=0 in file</span>
                )}
                {row.unit_price != null && (
                  <span className="text-xs tabular-nums shrink-0">{formatCurrency(row.unit_price)}/unit</span>
                )}
                {row.device_id
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  : <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />}
              </div>
            )
          })}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length} SKUs</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="rounded border p-0.5 hover:bg-muted disabled:opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                const p = pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= pages - 3 ? pages - 6 + i : page - 3 + i
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`min-w-[24px] rounded border px-1 py-0.5 text-xs ${p === page ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>
                    {p}
                  </button>
                )
              })}
              <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page === pages}
                className="rounded border p-0.5 hover:bg-muted disabled:opacity-40">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Submit a Request</h1>
        <p className="text-muted-foreground mt-1">Upload your device list to receive a quote within 24 hours.</p>
      </div>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <Card className="bg-gradient-to-br from-slate-50 to-blue-50/40 dark:from-slate-900 dark:to-blue-950/20 border-blue-100 dark:border-blue-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-0 sm:gap-0">
            {WORKFLOW_STEPS.map((step, i) => {
              const Icon = step.icon
              const isLast = i === WORKFLOW_STEPS.length - 1
              return (
                <div key={step.label} className="flex sm:flex-col items-center sm:items-center flex-1 gap-3 sm:gap-2 pb-3 sm:pb-0">
                  {/* Step circle */}
                  <div className="relative flex flex-col sm:flex-row items-center w-full sm:w-auto">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm z-10">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    {/* Connector line */}
                    {!isLast && (
                      <div className="hidden sm:block flex-1 h-0.5 bg-blue-200 dark:bg-blue-800 w-full" />
                    )}
                    {!isLast && (
                      <div className="block sm:hidden ml-5 w-0.5 h-5 bg-blue-200 dark:bg-blue-800" />
                    )}
                  </div>
                  <div className="sm:text-center">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{step.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{step.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Account error */}
      {customerLoadError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{customerLoadError}</span>
        </div>
      )}

      {/* ── Upload card ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 1 — Upload Your Device List</CardTitle>
          <CardDescription>
            Submit a Trade-In list, CPO list, or both. Download a template to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* ── Trade-In section ────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px] font-bold">T</span>
                <div>
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">Trade-In Devices</p>
                  <p className="text-xs text-muted-foreground">Devices you are selling / returning</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-green-600 text-green-700 hover:bg-green-50 dark:text-green-400" onClick={handleDownloadTradeTemplate}>
                  <Download className="h-3 w-3 mr-1" />CSV
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-green-600 text-green-700 hover:bg-green-50 dark:text-green-400" onClick={handleDownloadTradeExcelTemplate}>
                  <FileSpreadsheet className="h-3 w-3 mr-1" />Excel
                </Button>
              </div>
            </div>

            {/* Draft restored banner */}
            {draftRestoredAt && parsedRows.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-400">
                <span><span className="font-medium">Draft restored</span> — {parsedRows.length} SKU{parsedRows.length !== 1 ? 's' : ''} from {formatRelativeTime(draftRestoredAt)}.</span>
                <button onClick={() => { setParsedRows([]); setParsedSummary(null); setDraftRestoredAt(null); try { localStorage.removeItem(DRAFT_KEY) } catch { /**/ } }} className="text-xs text-blue-600 hover:text-blue-800 underline shrink-0">Clear</button>
              </div>
            )}

            {/* Drop zone */}
            {uploadFile && !parsing ? (
              <div className="flex items-center justify-between rounded-lg border border-muted bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileCheck2 className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{uploadFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button type="button" onClick={() => handleRedownload(uploadFile!)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Re-download</button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-primary hover:underline">Replace</button>
                  <button type="button" onClick={() => { setUploadFile(null); setParsedRows([]); setParsedSummary(null); setParseError(''); setRowValidationErrors(null); setDraftRestoredAt(null); try { localStorage.removeItem(DRAFT_KEY) } catch { /**/ } }} className="text-xs text-destructive hover:underline">Remove</button>
                </div>
                <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = '' }} />
              </div>
            ) : (
              <div
                className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${isDraggingTrade ? 'border-green-500 bg-green-50/30 dark:bg-green-950/20' : 'border-muted hover:border-green-400'}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setIsDraggingTrade(true) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingTrade(false) }}
                onDrop={e => { e.preventDefault(); setIsDraggingTrade(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f) }}
              >
                {parsing ? (uploadProgress > 0 ? <FileCheck2 className="h-8 w-8 text-primary" /> : <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />) : <FileUp className="h-8 w-8 text-muted-foreground" />}
                <p className="text-sm text-muted-foreground text-center">
                  {parsing ? uploadProgress > 0 ? `Processing… ${uploadProgress}%` : 'Reading your file…' : isDraggingTrade ? 'Drop your file here' : 'Drag & drop or click to upload your device list (Excel or CSV)'}
                </p>
                {parsing && uploadProgress > 0 && (
                  <div className="w-full max-w-xs h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = '' }} />
              </div>
            )}

            {parseError && <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{parseError}</p>}

            {/* Parsed preview */}
            {parsedSummary && parsedRows.length > 0 && (
              <div className="space-y-3">
                <div className={`rounded-md border px-4 py-3 text-sm space-y-1 ${matchedCount === parsedRows.length ? 'border-green-200 bg-green-50/40 text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400' : 'border-amber-200 bg-amber-50/40 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400'}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      {parsedSummary.total_devices} device{parsedSummary.total_devices !== 1 ? 's' : ''} across {parsedRows.length} SKU{parsedRows.length !== 1 ? 's' : ''}
                    </span>
                    {parsedSummary.format_type !== 'unknown' && <span className="text-xs opacity-70 capitalize">{parsedSummary.format_type === 'per_device' ? 'per-device manifest' : 'batch format'}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs opacity-80">
                    <span>{matchedCount}/{parsedRows.length} SKUs matched</span>
                    {parsedSummary.total_value != null && <span>Est. value: {formatCurrency(parsedSummary.total_value)}</span>}
                    {matchedCount < parsedRows.length && <span className="text-amber-600 dark:text-amber-400 font-medium">{parsedRows.length - matchedCount} unmatched — will be reviewed manually</span>}
                    {zeroQtyCount > 0 && <span className="text-red-600 dark:text-red-400 font-medium">{zeroQtyCount} row{zeroQtyCount !== 1 ? 's' : ''} have quantity 0 in your file</span>}
                  </div>
                </div>
                <RowEditor rows={parsedRows} setRows={setParsedRows} page={tradePage} setPage={setTradePage} sectionColor="green" />
                {rowValidationErrors && rowValidationErrors.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400 space-y-2">
                    <p className="font-semibold flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{rowValidationErrors.length} row{rowValidationErrors.length !== 1 ? 's' : ''} have errors:</p>
                    <ul className="ml-6 list-disc space-y-0.5 text-xs">
                      {rowValidationErrors.slice(0, 5).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                      {rowValidationErrors.length > 5 && <li>…and {rowValidationErrors.length - 5} more</li>}
                    </ul>
                    <p className="text-xs">Fix your file and re-upload, or skip invalid rows and submit the rest.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── CPO section ───────────────────────────────────────────────── */}
          <div className="space-y-3 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px] font-bold">C</span>
                <div>
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">CPO Devices <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span></p>
                  <p className="text-xs text-muted-foreground">Certified Pre-Owned devices you want to purchase</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-blue-600 text-blue-700 hover:bg-blue-50 dark:text-blue-400" onClick={handleDownloadCpoTemplate}>
                  <Download className="h-3 w-3 mr-1" />CSV
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-blue-600 text-blue-700 hover:bg-blue-50 dark:text-blue-400" onClick={handleDownloadCpoExcelTemplate}>
                  <FileSpreadsheet className="h-3 w-3 mr-1" />Excel
                </Button>
              </div>
            </div>

            {cpoUploadFile && !cpoParsing ? (
              <div className="flex items-center justify-between rounded-lg border border-muted bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileCheck2 className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{cpoUploadFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(cpoUploadFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button type="button" onClick={() => handleRedownload(cpoUploadFile!)} className="text-xs text-muted-foreground hover:text-foreground hover:underline">Re-download</button>
                  <button type="button" onClick={() => cpoFileInputRef.current?.click()} className="text-xs text-primary hover:underline">Replace</button>
                  <button type="button" onClick={() => { setCpoUploadFile(null); setCpoParsedRows([]); setCpoParsedSummary(null); setCpoParseError('') }} className="text-xs text-destructive hover:underline">Remove</button>
                </div>
                <input ref={cpoFileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCpoFileSelect(f); e.target.value = '' }} />
              </div>
            ) : (
              <div
                className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-6 cursor-pointer transition-colors ${isDraggingCpo ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/20' : 'border-blue-200 dark:border-blue-800 hover:border-blue-400'}`}
                onClick={() => cpoFileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setIsDraggingCpo(true) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingCpo(false) }}
                onDrop={e => { e.preventDefault(); setIsDraggingCpo(false); const f = e.dataTransfer.files[0]; if (f) handleCpoFileSelect(f) }}
              >
                {cpoParsing ? <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /> : <FileUp className="h-7 w-7 text-muted-foreground" />}
                <p className="text-sm text-muted-foreground text-center">{cpoParsing ? 'Reading your file…' : isDraggingCpo ? 'Drop your file here' : 'Drag & drop or click to upload your CPO device list'}</p>
                <input ref={cpoFileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCpoFileSelect(f); e.target.value = '' }} />
              </div>
            )}

            {cpoParseError && <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{cpoParseError}</p>}

            {cpoParsedSummary && cpoParsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-700 dark:text-blue-400">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {cpoParsedSummary.total_devices} CPO device{cpoParsedSummary.total_devices !== 1 ? 's' : ''} across {cpoParsedRows.length} SKU{cpoParsedRows.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <RowEditor rows={cpoParsedRows} setRows={setCpoParsedRows} page={cpoPage} setPage={setCpoPage} sectionColor="blue" />
              </div>
            )}
          </div>

          {/* ── Submit ────────────────────────────────────────────────────── */}
          {(parsedRows.length > 0 || cpoParsedRows.length > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <p className="text-xs text-muted-foreground">
                After submission, we&apos;ll review and send a quote within <strong>24 hours</strong>.
              </p>
              <div className="flex flex-wrap gap-2">
                {rowValidationErrors && rowValidationErrors.length > 0 && (
                  <Button variant="outline" onClick={() => handleSubmit(true)} disabled={submitting}>
                    {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Skip invalid &amp; submit
                  </Button>
                )}
                <Button variant="success" onClick={() => handleSubmit(false)} disabled={submitting || !customerId}>
                  {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {submitting ? 'Submitting…' : (() => {
                    const parts = [parsedRows.length > 0 ? `${parsedRows.length} Trade-In` : '', cpoParsedRows.length > 0 ? `${cpoParsedRows.length} CPO` : ''].filter(Boolean)
                    return `Submit Request (${parts.join(' + ')})`
                  })()}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── What happens next ─────────────────────────────────────────────── */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">What Happens After You Submit?</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {[
              { step: '1', title: 'Review & Pricing', detail: 'Our team verifies your device list and runs live market pricing. You\'ll receive a detailed quote by email within 24 hours.' },
              { step: '2', title: 'Accept or Decline', detail: 'Log in here to accept or decline the quote. No obligation until you accept.' },
              { step: '3', title: 'Ship Your Devices', detail: 'Once accepted, we send a prepaid shipping label. Pack and drop off your devices.' },
              { step: '4', title: 'Inspection & Payment', detail: 'We inspect each device. Payment is issued within 2–3 business days of receiving your shipment.' },
            ].map(({ step, title, detail }) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{step}</span>
                <div>
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* ── Manual creation ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prefer Manual Entry?</CardTitle>
          <CardDescription>Build your request device by device instead of uploading a file.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/orders/new">
            <Button><FilePlus2 className="mr-2 h-4 w-4" />New Order</Button>
          </Link>
          <Link href="/customer/orders">
            <Button variant="outline">View My Orders<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
        </CardContent>
      </Card>

      {/* ── Recent requests ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Requests</CardTitle>
          <CardDescription>Your latest trade-in activity</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />)}</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10">
              <ClipboardList className="mx-auto h-9 w-9 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">No requests yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <Link key={order.id} href={`/customer/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">Updated {formatRelativeTime(order.updated_at || order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs capitalize">{order.status?.replace(/_/g, ' ')}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
