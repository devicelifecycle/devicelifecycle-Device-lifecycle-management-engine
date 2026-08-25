'use client'

// ============================================================================
// END CUSTOMER CONSOLE — Device / Asset Register
// ============================================================================
// The customer's own inventory: register a device, assign it to someone,
// retire it, or move it. Separate from the shared device catalog — customers
// cannot see or edit the catalog. Backed by GET/POST/PATCH /api/customer/assets plus a
// POST /bulk sibling for CSV imports.

import { useEffect, useState } from 'react'
import { Boxes, Plus, Loader2, X, History, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { ComingSoon } from '@/components/ComingSoon'
import { useMyCustomer } from '@/hooks/useCustomers'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ASSET_STATUSES, ASSET_STATUS_LABEL, canTransitionAsset, type AssetStatus } from '@/lib/assets'
import { formatDateTime } from '@/lib/utils'
import { parseTabularUpload } from '@/lib/csv-templates'

interface Asset {
  id: string
  label: string
  serial_number: string | null
  status: AssetStatus
  assigned_to: string | null
  location: string | null
  notes: string | null
  created_at: string
}

const STATUS_STYLE: Record<AssetStatus, string> = {
  registered: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  assigned: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  retired: 'bg-muted text-muted-foreground',
}

type AssetEventType = 'registered' | 'assigned' | 'unassigned' | 'retired' | 'restored' | 'moved' | 'updated'

interface AssetEvent {
  id: string
  event_type: AssetEventType
  details: Record<string, unknown> | null
  actor_id: string | null
  created_at: string
}

// Audit-trail pill per event type. The shared Badge ships no colored variants,
// so tints ride along via className using the same palette as STATUS_STYLE.
const EVENT_BADGE: Record<AssetEventType, { variant: 'secondary' | 'destructive'; className: string }> = {
  registered: { variant: 'secondary', className: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  moved: { variant: 'secondary', className: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  assigned: { variant: 'secondary', className: 'border-transparent bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
  restored: { variant: 'secondary', className: 'border-transparent bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
  unassigned: { variant: 'secondary', className: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  retired: { variant: 'destructive', className: '' },
  updated: { variant: 'secondary', className: 'border-transparent bg-muted text-muted-foreground' },
}

/** Human phrasing of a free-form details blob; '—' when nothing renders. Shape mirrors what
 *  POST/PATCH /api/customer/assets writes: {status:'registered'} on create, {field,from,to}
 *  for status/assigned_to changes, {location?:{from,to}, notes?:{from,to}} for field edits. */
function eventDetailLine(details: AssetEvent['details']): string {
  if (!details) return '—'
  const d = details as Record<string, unknown>
  const str = (v: unknown): string => (v === undefined || v === null || v === '' ? '—' : String(v))
  const pretty = (v: unknown): string => {
    const s = str(v)
    return (ASSET_STATUSES as readonly string[]).includes(s) ? ASSET_STATUS_LABEL[s as AssetStatus] : s
  }
  if (d.field === 'status') return `status: ${pretty(d.from)} → ${pretty(d.to)}`
  if (d.field === 'assigned_to') return `assigned to: ${str(d.from)} → ${str(d.to)}`
  if (d.location && typeof d.location === 'object') {
    const { to } = d.location as { from?: unknown; to?: unknown }
    return `location: ${str(to)}`
  }
  if (d.notes && typeof d.notes === 'object') return 'notes updated'
  if (d.status === 'registered') return 'Initial registration'
  return '—'
}

export default function CustomerAssetsPage() {
  return <ComingSoon title="Device Register" />
}

function CustomerAssetsPageImpl() {
  const { customer, isLoading: loadingCustomer } = useMyCustomer()
  const [assets, setAssets] = useState<Asset[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const limit = 20

  const load = () => {
    if (!customer?.id) return
    setLoading(true)
    fetch(`/api/customer/assets?customer_id=${customer.id}&page=${page}&limit=${limit}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: Asset[]; total?: number } | null) => {
        if (d) { setAssets(d.data ?? []); setTotal(d.total ?? 0) }
      })
      .catch(() => toast.error('Could not load your device list'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [customer?.id, page])

  const changeStatus = async (asset: Asset, status: AssetStatus) => {
    if (!canTransitionAsset(asset.status, status)) return
    const res = await fetch('/api/customer/assets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: asset.id, status }),
    })
    if (!res.ok) { toast.error('Could not update status'); return }
    toast.success(`Marked ${ASSET_STATUS_LABEL[status].toLowerCase()}`)
    load()
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Boxes className="h-6 w-6 text-primary" /> Device Register</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your organization&apos;s own device list — register, assign, move, and retire devices as needed.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setImportOpen(true)} disabled={!customer?.id}>
            <Upload className="mr-1 h-4 w-4" />
            Import
          </Button>
          <Button type="button" onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? <X className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
            {formOpen ? 'Cancel' : 'Register device'}
          </Button>
        </div>
      </div>

      {formOpen && customer?.id && (
        <RegisterAssetForm customerId={customer.id} onDone={() => { setFormOpen(false); load() }} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Devices</CardTitle>
          <CardDescription>{total} device{total === 1 ? '' : 's'} registered.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCustomer || loading ? (
            <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : assets.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No devices registered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned to</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.label}</TableCell>
                      <TableCell className="font-mono text-xs">{a.serial_number || '—'}</TableCell>
                      <TableCell>
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status]}`}>{ASSET_STATUS_LABEL[a.status]}</span>
                      </TableCell>
                      <TableCell>{a.assigned_to || '—'}</TableCell>
                      <TableCell>{a.location || '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <AssetActions asset={a} onChange={changeStatus} />
                          <AssetHistoryDialog asset={a} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
          )}
        </CardContent>
      </Card>

      {customer?.id && (
        <ImportAssetCsvDialog
          customerId={customer.id}
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={load}
        />
      )}
    </div>
  )
}

function AssetActions({ asset, onChange }: { asset: Asset; onChange: (a: Asset, s: AssetStatus) => void }) {
  const options = ASSET_STATUSES.filter((s) => canTransitionAsset(asset.status, s))
  if (options.length === 0) return null
  return (
    <Select value="" onValueChange={(v) => onChange(asset, v as AssetStatus)}>
      <SelectTrigger className="ml-auto h-8 w-[140px] text-xs"><SelectValue placeholder="Change status" /></SelectTrigger>
      <SelectContent>
        {options.map((s) => <SelectItem key={s} value={s}>{ASSET_STATUS_LABEL[s]}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function AssetHistoryDialog({ asset }: { asset: Asset }) {
  const [open, setOpen] = useState(false)
  // Lazy-loaded on first open, then cached per asset for the row's lifetime.
  const [events, setEvents] = useState<AssetEvent[] | null>(null)
  const [loading, setLoading] = useState(false)

  const openAndLoad = (next: boolean) => {
    setOpen(next)
    if (!next || events !== null || loading) return
    setLoading(true)
    fetch(`/api/customer/assets/${asset.id}/events`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { events?: AssetEvent[] } | null) => setEvents(j?.events ?? []))
      .catch(() => toast.error('Could not load history'))
      .finally(() => setLoading(false))
  }

  return (
    <Dialog open={open} onOpenChange={openAndLoad}>
      <Button type="button" variant="ghost" size="icon" title="History" onClick={() => openAndLoad(true)}>
        <History className="h-4 w-4" />
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Device history</DialogTitle>
          <DialogDescription>{asset.label} — most recent first.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pb-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : !events || events.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No history yet.</p>
          ) : (
            events.map((ev) => {
              const badge = EVENT_BADGE[ev.event_type] ?? EVENT_BADGE.updated
              return (
                <div key={ev.id} className="flex items-start justify-between gap-3 border-b border-border/50 py-2.5 last:border-0">
                  <div className="min-w-0">
                    <Badge variant={badge.variant} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>{ev.event_type}</Badge>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{eventDetailLine(ev.details)}</p>
                  </div>
                  <span className="whitespace-nowrap pt-0.5 text-xs text-muted-foreground">{formatDateTime(ev.created_at)}</span>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RegisterAssetForm({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const [label, setLabel] = useState('')
  const [serial, setSerial] = useState('')
  const [location, setLocation] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!label.trim()) { toast.error('Device name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/customer/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          label: label.trim(),
          serial_number: serial.trim() || undefined,
          location: location.trim() || undefined,
          assigned_to: assignedTo.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Could not register device'); return }
      toast.success('Device registered')
      onDone()
    } catch {
      toast.error('Could not register device')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Register a device</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Device name *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="iPhone 15 — Sales Team" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Serial / IMEI</Label>
            <Input className="font-mono" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assigned to</Label>
            <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Name or team (optional)" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Register device
        </Button>
      </CardContent>
    </Card>
  )
}
// ============================================================================
// CSV IMPORT DIALOG — bulk-register devices from a spreadsheet
// ============================================================================
// The browser parses the file (parseTabularUpload, PapaParse under the hood)
// and previews every row with client-side validation markers before anything
// is sent. On submit all rows go to POST /api/customer/assets/bulk, which
// re-validates each row authoritatively and reports per-row failures; those
// are listed here and downloadable as CSV.

/** Mirrors MAX_ROWS on the bulk endpoint — reject oversized files up front. */
const MAX_IMPORT_ROWS = 500

interface ImportRow {
  label: string
  serial_number?: string
  status?: string
  assigned_to?: string
  location?: string
  notes?: string
}

interface FailedRow {
  row_index: number
  reason: string
}

interface PreviewRow {
  line: number
  row: ImportRow
  issue: string | null
}

// CSV column aliases accepted in uploaded files (same idea as the devices page).
const IMPORT_ALIASES: Record<string, string> = {
  label: 'label', device: 'label', device_name: 'label', name: 'label',
  serial_number: 'serial_number', serial: 'serial_number', imei: 'serial_number',
  status: 'status',
  assigned_to: 'assigned_to', assignee: 'assigned_to',
  location: 'location', site: 'location',
  notes: 'notes', note: 'notes', comments: 'notes',
}

/** Map raw CSV records to import rows and flag problems the server will also catch,
 *  so the user sees them before submitting. Duplicate detection runs in file order,
 *  keeping the first occurrence of each serial (mirrors the endpoint). */
function buildPreview(rows: Record<string, string>[]): PreviewRow[] {
  const seenSerials = new Set<string>()
  return rows.map((raw, i) => {
    const mapped: Record<string, string> = {}
    for (const [key, value] of Object.entries(raw)) {
      const canonical = IMPORT_ALIASES[key.toLowerCase().trim()] ?? key.toLowerCase().trim()
      if (!mapped[canonical]) mapped[canonical] = String(value ?? '').trim()
    }

    const row: ImportRow = { label: mapped.label ?? '' }
    if (mapped.serial_number) row.serial_number = mapped.serial_number
    if (mapped.status) row.status = mapped.status.toLowerCase()
    if (mapped.assigned_to) row.assigned_to = mapped.assigned_to
    if (mapped.location) row.location = mapped.location
    if (mapped.notes) row.notes = mapped.notes

    let issue: string | null = null
    if (!row.label) issue = 'Device name is required'
    else if (row.label.length > 200) issue = 'Device name exceeds 200 characters'
    else if ((row.serial_number?.length ?? 0) > 120) issue = 'Serial exceeds 120 characters'
    else if (row.status && !(ASSET_STATUSES as readonly string[]).includes(row.status)) issue = `Status must be one of: ${ASSET_STATUSES.join(', ')}`
    else if ((row.assigned_to?.length ?? 0) > 160) issue = '"Assigned to" exceeds 160 characters'
    else if ((row.location?.length ?? 0) > 160) issue = 'Location exceeds 160 characters'
    else if ((row.notes?.length ?? 0) > 2000) issue = 'Notes exceed 2000 characters'
    else if (row.serial_number) {
      const key = row.serial_number.toLowerCase()
      if (seenSerials.has(key)) issue = `Duplicate serial "${row.serial_number}" within the file`
      else seenSerials.add(key)
    }
    return { line: i + 1, row, issue }
  })
}

function ImportAssetCsvDialog({ customerId, open, onOpenChange, onImported }: {
  customerId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}) {
  type Stage = 'pick' | 'preview' | 'result'
  const [stage, setStage] = useState<Stage>('pick')
  const [preview, setPreview] = useState<PreviewRow[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<{ imported: number; failed: FailedRow[] } | null>(null)

  const reset = () => { setStage('pick'); setPreview(null); setResult(null); setSubmitting(false); setParsing(false) }
  const close = (next: boolean) => { onOpenChange(next); if (!next) reset() }

  const handleFile = async (file: File) => {
    setParsing(true)
    try {
      const { rows } = await parseTabularUpload(file)
      const mapped = rows.map((raw) => {
        // parseTabularUpload already trims values; drop fully-empty rows.
        return Object.values(raw).some((v) => String(v ?? '').trim() !== '') ? raw : null
      }).filter((r): r is Record<string, string> => r !== null)

      if (mapped.length === 0) { toast.error('No rows found in file'); return }
      if (mapped.length > MAX_IMPORT_ROWS) {
        toast.error(`Too many rows — the limit is ${MAX_IMPORT_ROWS} per import (file has ${mapped.length})`)
        return
      }
      setPreview(buildPreview(mapped))
      setStage('preview')
    } catch {
      toast.error('Could not read that file')
    } finally {
      setParsing(false)
    }
  }

  const submit = async () => {
    if (!preview || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/customer/assets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, rows: preview.map((p) => p.row) }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Import failed'); return }
      setResult(data as { imported: number; failed: FailedRow[] })
      setStage('result')
      if ((data as { imported: number }).imported > 0) {
        toast.success(`Imported ${data.imported} device${data.imported === 1 ? '' : 's'}`)
        onImported() // refresh the register table behind the dialog
      }
    } catch {
      toast.error('Import failed')
    } finally {
      setSubmitting(false)
    }
  }

  const downloadFailures = () => {
    if (!result) return
    // Row index + 2 = the physical CSV line (1-based, plus the header row).
    const lines = [
      'line,reason',
      ...result.failed.map((f) => `${f.row_index + 2},"${f.reason.replace(/"/g, '""')}"`),
    ]
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'asset-import-failures.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const validCount = preview?.filter((p) => !p.issue).length ?? 0

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import devices from CSV</DialogTitle>
          <DialogDescription>
            {stage === 'pick' && 'Pick a .csv file with columns: label, serial_number, status, assigned_to, location, notes (only "label" is required).'}
            {stage === 'preview' && `${validCount} of ${preview?.length ?? 0} rows ready — flagged rows will be skipped.`}
            {stage === 'result' && (result && result.imported > 0 ? 'The register has been refreshed.' : 'Nothing was imported.')}
          </DialogDescription>
        </DialogHeader>

        {stage === 'pick' && (
          <div className="space-y-4 py-2">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-10 text-sm text-muted-foreground hover:bg-muted/40">
              {parsing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              {parsing ? 'Reading file…' : 'Click to choose a .csv file'}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                disabled={parsing}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
              />
            </label>
            <p className="text-xs text-muted-foreground">Up to {MAX_IMPORT_ROWS} rows per import.</p>
          </div>
        )}

        {stage === 'preview' && (
          <div className="space-y-3 pb-1">
            <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Line</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Problem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(preview ?? []).map((p) => (
                    <TableRow key={p.line}>
                      <TableCell className="text-xs text-muted-foreground">{p.line}</TableCell>
                      <TableCell className="font-medium">{p.row.label || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="font-mono text-xs">{p.row.serial_number || '—'}</TableCell>
                      <TableCell>{p.row.status ? ASSET_STATUS_LABEL[p.row.status as AssetStatus] ?? p.row.status : 'Registered'}</TableCell>
                      <TableCell className="text-xs">
                        {p.issue
                          ? <span className="text-destructive">{p.issue}</span>
                          : <span className="text-green-600 dark:text-green-400">Ready</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={submit} disabled={submitting || validCount === 0}>
                {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Import {validCount} device{validCount === 1 ? '' : 's'}
              </Button>
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={submitting}>Cancel</Button>
            </div>
          </div>
        )}

        {stage === 'result' && result && (
          <div className="space-y-3 pb-1">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="font-medium text-green-600 dark:text-green-400">{result.imported} imported</span>
              <span className={result.failed.length > 0 ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                {result.failed.length} failed
              </span>
            </div>
            {result.failed.length > 0 && (
              <>
                <div className="max-h-[40vh] space-y-2 overflow-auto rounded-md border border-border p-3">
                  {result.failed.map((f) => (
                    <div key={f.row_index} className="text-xs">
                      <span className="font-mono text-muted-foreground">Line {f.row_index + 2}: </span>
                      <span className="text-destructive">{f.reason}</span>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" onClick={downloadFailures}>
                  <Upload className="mr-1 h-4 w-4 rotate-180" />
                  Download failures
                </Button>
              </>
            )}
            <Button type="button" onClick={() => close(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}