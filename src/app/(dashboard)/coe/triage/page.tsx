// ============================================================================
// COE TRIAGE PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardCheck, Search, AlertTriangle, CheckCircle2, Plus, Smartphone,
  Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, Hash, FileText,
  Upload, X, CheckCircle, XCircle, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { useDebounce } from '@/hooks/useDebounce'
import { TRIAGE_CHECKLIST_ITEMS, COMMON_DEVICE_ISSUES, CONDITION_CONFIG } from '@/lib/constants'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import type { IMEIRecord, DeviceCondition, Device } from '@/types'

const conditions: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']
const screenConditions = ['good', 'cracked', 'damaged', 'dead'] as const

type ImeiLookupResult = {
  imei: string
  valid: boolean
  tac: string
  device: { make: string; model: string } | null
  existing_record: { id: string; triage_status: string; order_id: string | null } | null
  carrier_locked: 'yes' | 'no' | 'unknown'
  blacklisted: 'yes' | 'no' | 'unknown'
  activation_locked: 'yes' | 'no' | 'unknown'
  note: string | null
}

type OrderRefResult = {
  id: string
  order_number: string
  status: string
  total_quantity: number
  quoted_amount: number | null
  items: Array<{
    id: string
    device: { make: string; model: string } | null
    quantity: number
    claimed_condition: string
    quoted_price: number | null
    storage: string | null
  }>
}

function StatusPill({ value, label }: { value: 'yes' | 'no' | 'unknown'; label: string }) {
  if (value === 'yes') return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
      <ShieldAlert className="h-3.5 w-3.5" />{label}
    </span>
  )
  if (value === 'no') return (
    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
      <ShieldCheck className="h-3.5 w-3.5" />{label}: Clear
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ShieldQuestion className="h-3.5 w-3.5" />{label}: Unknown
    </span>
  )
}

export default function COETriagePage() {
  const [pendingItems, setPendingItems] = useState<IMEIRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)

  // ── Triage form state ────────────────────────────────────────────────────
  const [triageDialogOpen, setTriageDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<IMEIRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [physicalCondition, setPhysicalCondition] = useState<DeviceCondition>('good')
  const [screenCondition, setScreenCondition] = useState<string>('good')
  const [batteryHealth, setBatteryHealth] = useState('85')
  const [issues, setIssues] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  // ── IMEI lookup (inside triage dialog) ─────────────────────────────────
  const [imeiLookup, setImeiLookup] = useState<ImeiLookupResult | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)

  // ── Order / Quote reference lookup panel ────────────────────────────────
  const [refType, setRefType] = useState<'order' | 'quote'>('order')
  const [refInput, setRefInput] = useState('')
  const debouncedRef = useDebounce(refInput, 400)
  const [refResult, setRefResult] = useState<OrderRefResult | null>(null)
  const [refLoading, setRefLoading] = useState(false)
  const [refError, setRefError] = useState('')

  // ── Template file upload ─────────────────────────────────────────────────
  type UploadRow = {
    row: number
    imei?: string
    serial?: string
    brand?: string
    model?: string
    condition?: string
    storage?: string
    color?: string
    battery_health?: number
    sim_lock?: string
    locked_carrier?: string
    device_cost?: number
    repair_cost?: number
    quantity?: number
    notes?: string
    match_status: string
    device_id?: string | null
    matched_item?: { device: { make: string; model: string } | null; claimed_condition: string | null; quoted_price: number | null } | null
    quoted_price?: number | null
  }
  const [uploadResult, setUploadResult] = useState<{
    detected_ref: string | null
    order: { id: string; order_number: string; status: string; total_quantity: number; quoted_amount: number | null } | null
    rows: UploadRow[]
    total: number; matched: number; condition_mismatches: number; not_in_order: number
  } | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setIsUploading(true)
    setUploadError('')
    setUploadResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/triage/upload-template', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setUploadResult(data)
      if (data.detected_ref) {
        setRefInput(data.detected_ref)
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally { setIsUploading(false) }
  }

  const handleBulkImport = async () => {
    if (!uploadResult) return
    const importable = uploadResult.rows.filter(r => r.imei && r.device_id && r.match_status !== 'not_in_order')
    if (importable.length === 0) {
      toast.error('No rows with both an IMEI and a recognised device to import')
      return
    }
    setIsImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_import',
          rows: importable.map(r => ({
            imei: r.imei,
            device_id: r.device_id,
            claimed_condition: r.condition,
            storage: r.storage,
            color: r.color,
            battery_health: r.battery_health,
            sim_lock: r.sim_lock,
            locked_carrier: r.locked_carrier,
            device_cost: r.device_cost,
            repair_cost: r.repair_cost,
            notes: r.notes,
            order_id: uploadResult.order?.id,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setImportResult(data)
      if (data.imported > 0) {
        toast.success(`${data.imported} device${data.imported !== 1 ? 's' : ''} added to triage queue`)
        fetchPending()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk import failed')
    } finally { setIsImporting(false) }
  }

  // ── Add device dialog state ──────────────────────────────────────────────
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deviceSearch, setDeviceSearch] = useState('')
  const debouncedDeviceSearch = useDebounce(deviceSearch, 300)
  const [deviceResults, setDeviceResults] = useState<Device[]>([])
  const [isSearchingDevices, setIsSearchingDevices] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [addForm, setAddForm] = useState({
    imei: '',
    claimed_condition: 'good' as DeviceCondition,
    storage: '',
    color: '',
    notes: '',
  })
  const [isAdding, setIsAdding] = useState(false)

  const fetchPending = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/triage?type=pending')
      if (res.ok) {
        const data = await res.json()
        setPendingItems(data.data || [])
      }
    } catch {} finally { setIsLoading(false) }
  }, [])

  const removePendingItem = useCallback((itemId: string) => {
    setPendingItems((prev) => prev.filter((item) => item.id !== itemId))
  }, [])

  const prependPendingItem = useCallback((item: IMEIRecord) => {
    setPendingItems((prev) => [item, ...prev.filter((existing) => existing.id !== item.id)])
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  // Device search for add dialog
  useEffect(() => {
    if (!debouncedDeviceSearch.trim()) { setDeviceResults([]); return }
    const run = async () => {
      setIsSearchingDevices(true)
      try {
        const res = await fetch(`/api/devices?search=${encodeURIComponent(debouncedDeviceSearch)}&limit=10`)
        if (res.ok) { const data = await res.json(); setDeviceResults(data.data || []) }
      } catch {} finally { setIsSearchingDevices(false) }
    }
    run()
  }, [debouncedDeviceSearch])

  // Order / quote reference lookup
  useEffect(() => {
    const q = debouncedRef.trim()
    if (!q) { setRefResult(null); setRefError(''); return }
    const run = async () => {
      setRefLoading(true)
      setRefError('')
      try {
        const res = await fetch(`/api/orders?search=${encodeURIComponent(q)}&page=1&page_size=1`)
        if (!res.ok) throw new Error()
        const data = await res.json()
        const orders: OrderRefResult[] = data.data || []
        // For quote mode, require a quoted_amount
        const match = refType === 'quote'
          ? orders.find(o => (o.quoted_amount ?? 0) > 0)
          : orders[0]
        if (!match) {
          setRefResult(null)
          setRefError(refType === 'quote' ? 'No quoted order found with that number' : 'No order found')
        } else {
          // Fetch full order with items
          const detailRes = await fetch(`/api/orders/${match.id}`)
          if (!detailRes.ok) throw new Error()
          const detail = await detailRes.json()
          setRefResult(detail.data ?? detail)
        }
      } catch {
        setRefError('Lookup failed')
      } finally { setRefLoading(false) }
    }
    run()
  }, [debouncedRef, refType])

  // IMEI lookup for selected triage item
  const handleImeiLookup = async () => {
    if (!selectedItem?.imei) return
    setIsLookingUp(true)
    setImeiLookup(null)
    try {
      const res = await fetch(`/api/imei-lookup?imei=${encodeURIComponent(selectedItem.imei)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setImeiLookup(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'IMEI lookup failed')
    } finally { setIsLookingUp(false) }
  }

  const openAddDialog = () => {
    setAddForm({ imei: '', claimed_condition: 'good', storage: '', color: '', notes: '' })
    setSelectedDevice(null)
    setDeviceSearch('')
    setDeviceResults([])
    setAddDialogOpen(true)
  }

  const handleAddDevice = async () => {
    if (!selectedDevice || !addForm.imei.trim()) {
      toast.error('Please select a device and enter an IMEI')
      return
    }
    setIsAdding(true)
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_device',
          imei: addForm.imei.trim(),
          device_id: selectedDevice.id,
          claimed_condition: addForm.claimed_condition,
          storage: addForm.storage || undefined,
          color: addForm.color || undefined,
          notes: addForm.notes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add device')
      }
      const data = await res.json()
      if (data?.data) {
        prependPendingItem(data.data as IMEIRecord)
      }
      toast.success('Device added to triage queue')
      setAddDialogOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add device')
    } finally { setIsAdding(false) }
  }

  const openTriageDialog = (item: IMEIRecord) => {
    setSelectedItem(item)
    const initialChecklist: Record<string, boolean> = {}
    TRIAGE_CHECKLIST_ITEMS.forEach(c => { initialChecklist[c.id] = false })
    setChecklist(initialChecklist)
    setPhysicalCondition('good')
    setScreenCondition('good')
    setBatteryHealth('85')
    setIssues([])
    setNotes('')
    setImeiLookup(null)
    setTriageDialogOpen(true)
  }

  const toggleChecklistItem = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleIssue = (issue: string) => {
    setIssues(prev => prev.includes(issue) ? prev.filter(i => i !== issue) : [...prev, issue])
  }

  const handleSubmitTriage = async () => {
    if (!selectedItem) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imei_record_id: selectedItem.id,
          physical_condition: physicalCondition,
          functional_grade: physicalCondition,
          cosmetic_grade: physicalCondition,
          screen_condition: screenCondition,
          battery_health: parseInt(batteryHealth) || 0,
          storage_verified: checklist.power_on || false,
          original_accessories: false,
          functional_tests: {
            touchscreen: checklist.touch_responsive || false,
            display: checklist.screen_functional || false,
            speakers: checklist.speakers_working || false,
            microphone: checklist.microphone_working || false,
            cameras: checklist.cameras_working || false,
            wifi: checklist.wifi_working || false,
            bluetooth: true,
            cellular: checklist.cellular_working || false,
            charging_port: true,
            buttons: checklist.buttons_working || false,
            face_id_or_touch_id: true,
            gps: true,
          },
          notes: `${notes}${issues.length > 0 ? `\nIssues found: ${issues.join(', ')}` : ''}`,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to submit triage')
      }
      const result = await res.json()
      if (result.outcome?.exception_required) {
        toast.warning('Triage complete — exception flagged for manager review')
      } else {
        toast.success('Triage complete — device passed')
      }
      removePendingItem(selectedItem.id)
      setTriageDialogOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit triage')
    } finally { setIsSubmitting(false) }
  }

  const filtered = pendingItems.filter(item => {
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      item.imei?.toLowerCase().includes(q) ||
      (item.device as unknown as Record<string, string>)?.make?.toLowerCase().includes(q) ||
      (item.device as unknown as Record<string, string>)?.model?.toLowerCase().includes(q)
    )
  })

  const passedCount = TRIAGE_CHECKLIST_ITEMS.filter(c => checklist[c.id]).length

  // Find quoted price for selected item from ref lookup (if matching order)
  const selectedItemOrder = selectedItem?.order as unknown as { id?: string } | undefined
  const refItems = refResult?.items ?? []
  const quotedPriceForItem = selectedItemOrder?.id === refResult?.id
    ? refItems.find(i => {
        const d = i.device as { make?: string; model?: string } | null
        const sel = (selectedItem?.device as unknown as Record<string, string>) ?? {}
        return d?.make?.toLowerCase() === sel.make?.toLowerCase() && d?.model?.toLowerCase() === sel.model?.toLowerCase()
      })?.quoted_price ?? null
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Triage</h1>
          <p className="text-muted-foreground">Inspect and grade received devices</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={openAddDialog}>
            <Plus className="mr-1.5 h-4 w-4" />Add Device
          </Button>
          <Badge variant="outline" className="text-sm px-3 py-1">
            {pendingItems.length} pending
          </Badge>
        </div>
      </div>

      {/* ── Order / Quote Reference Lookup ──────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Order / Quote Reference Lookup
          </CardTitle>
          <CardDescription className="text-xs">
            Enter an order or quote number to see expected devices and quoted prices before triaging.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex rounded-lg border overflow-hidden shrink-0">
              <button
                onClick={() => { setRefType('order'); setRefResult(null); setRefError('') }}
                className={`px-3 py-2 text-xs font-medium transition-colors ${refType === 'order' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
              >
                Order #
              </button>
              <button
                onClick={() => { setRefType('quote'); setRefResult(null); setRefError('') }}
                className={`px-3 py-2 text-xs font-medium transition-colors ${refType === 'quote' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
              >
                Quote #
              </button>
            </div>
            <div className="relative flex-1">
              <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={refType === 'order' ? 'Enter order number (e.g. ORD-0001)' : 'Enter quote / order number'}
                value={refInput}
                onChange={e => setRefInput(e.target.value)}
              />
            </div>
            {refLoading && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
          </div>

          {refError && (
            <p className="text-xs text-muted-foreground mt-2">{refError}</p>
          )}

          {refResult && (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{refResult.order_number}</span>
                  <Badge variant="outline" className="text-[11px]">{refResult.status.replace(/_/g, ' ')}</Badge>
                </div>
                {(refResult.quoted_amount ?? 0) > 0 && (
                  <span className="text-sm font-medium text-green-700">
                    Quoted: {formatCurrency(refResult.quoted_amount!)}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Device</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs">Claimed Condition</TableHead>
                      <TableHead className="text-xs text-right">Quoted Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refItems.map(item => {
                      const d = item.device as { make?: string; model?: string } | null
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-xs font-medium">
                            {d ? `${d.make} ${d.model}` : '—'}
                            {item.storage && <span className="text-muted-foreground ml-1">({item.storage})</span>}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{item.quantity}</TableCell>
                          <TableCell className="text-xs">
                            <span className={CONDITION_CONFIG[item.claimed_condition as DeviceCondition]?.color || ''}>
                              {CONDITION_CONFIG[item.claimed_condition as DeviceCondition]?.label || item.claimed_condition}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums font-medium">
                            {item.quoted_price != null ? formatCurrency(item.quoted_price) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Template File Upload ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4 text-muted-foreground" />
            Upload Device Template (CSV)
          </CardTitle>
          <CardDescription className="text-xs">
            Upload a spreadsheet with IMEI, make, model, condition — the system auto-detects order/quote numbers and flags mismatches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,.txt"
                className="sr-only"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <div className={`flex items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm font-medium transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'}`}>
                {isUploading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</>
                  : <><Upload className="h-4 w-4" />Choose CSV file</>
                }
              </div>
            </label>
            {uploadResult && (
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3.5 w-3.5" />{uploadResult.matched} matched</span>
                {uploadResult.condition_mismatches > 0 && (
                  <span className="flex items-center gap-1 text-amber-600"><AlertCircle className="h-3.5 w-3.5" />{uploadResult.condition_mismatches} condition mismatch{uploadResult.condition_mismatches !== 1 ? 'es' : ''}</span>
                )}
                {uploadResult.not_in_order > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-3.5 w-3.5" />{uploadResult.not_in_order} not in order</span>
                )}
                <button onClick={() => { setUploadResult(null); setUploadError('') }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          </div>

          {uploadResult && (
            <div className="mt-4 space-y-3">
              {/* Summary + import action */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  {uploadResult.detected_ref && (
                    <p className="text-xs text-muted-foreground">
                      Auto-detected: <span className="font-medium text-foreground">{uploadResult.detected_ref}</span>
                      {uploadResult.order ? ` → ${uploadResult.order.order_number} (${uploadResult.order.status.replace(/_/g, ' ')})` : ' — order not found'}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {uploadResult.total} rows parsed — {uploadResult.rows.filter(r => r.imei && r.device_id).length} ready to import
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {importResult && (
                    <span className="text-xs text-green-700 font-medium">
                      {importResult.imported} imported, {importResult.skipped} skipped{importResult.errors.length > 0 ? `, ${importResult.errors.length} errors` : ''}
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={handleBulkImport}
                    disabled={isImporting || uploadResult.rows.filter(r => r.imei && r.device_id).length === 0}
                  >
                    {isImporting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Importing...</> : <><Plus className="h-3.5 w-3.5 mr-1.5" />Import to Triage Queue</>}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-8">#</TableHead>
                      <TableHead className="text-xs">IMEI / Serial</TableHead>
                      <TableHead className="text-xs">Device</TableHead>
                      <TableHead className="text-xs">Color</TableHead>
                      <TableHead className="text-xs">Grade</TableHead>
                      <TableHead className="text-xs text-center">Battery</TableHead>
                      <TableHead className="text-xs">SIM / Carrier</TableHead>
                      <TableHead className="text-xs">Notes</TableHead>
                      <TableHead className="text-xs text-right">Device Cost</TableHead>
                      <TableHead className="text-xs text-right">Repair Cost</TableHead>
                      <TableHead className="text-xs text-right">Quoted Price</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadResult.rows.map(row => (
                      <TableRow key={row.row} className={
                        row.match_status === 'condition_mismatch' ? 'bg-amber-50' :
                        row.match_status === 'not_in_order' ? 'bg-red-50/50' : ''
                      }>
                        <TableCell className="text-xs text-muted-foreground">{row.row}</TableCell>
                        <TableCell className="text-xs font-mono whitespace-nowrap">
                          <div>{row.imei || '—'}</div>
                          {row.serial && row.serial !== row.imei && (
                            <div className="text-muted-foreground text-[10px]">{row.serial}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-medium whitespace-nowrap">
                          {[row.brand, row.model].filter(Boolean).join(' ') || '—'}
                          {row.storage && <span className="text-muted-foreground ml-1">({row.storage})</span>}
                          {!row.device_id && row.brand && (
                            <span className="ml-1 text-amber-600 text-[10px]">not in catalog</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{row.color || '—'}</TableCell>
                        <TableCell className="text-xs capitalize">
                          {row.condition
                            ? <span className={row.matched_item?.claimed_condition && row.condition !== row.matched_item.claimed_condition ? 'text-amber-600 font-medium' : ''}>
                                {row.condition}
                              </span>
                            : '—'}
                          {row.matched_item?.claimed_condition && row.condition !== row.matched_item.claimed_condition && (
                            <div className="text-[10px] text-muted-foreground">quoted: {row.matched_item.claimed_condition}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-center">
                          {row.battery_health != null
                            ? <span className={row.battery_health < 80 ? 'text-amber-600 font-medium' : 'text-green-700'}>{row.battery_health}%</span>
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{row.sim_lock || '—'}</div>
                          {row.locked_carrier && <div className="text-muted-foreground text-[10px]">{row.locked_carrier}</div>}
                        </TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate" title={row.notes}>{row.notes || '—'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.device_cost != null ? formatCurrency(row.device_cost) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.repair_cost != null && row.repair_cost > 0 ? formatCurrency(row.repair_cost) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {row.quoted_price != null ? formatCurrency(row.quoted_price) : '—'}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {row.match_status === 'matched' && (
                            <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3 w-3" />Matched</span>
                          )}
                          {row.match_status === 'condition_mismatch' && (
                            <span className="flex items-center gap-1 text-amber-600"><AlertCircle className="h-3 w-3" />Condition mismatch</span>
                          )}
                          {row.match_status === 'not_in_order' && (
                            <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-3 w-3" />Not in order</span>
                          )}
                          {row.match_status === 'no_order' && (
                            <span className="text-muted-foreground">No order ref</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pending Items Table ─────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by IMEI, device make, or model..." className="pl-10 bg-background" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Devices Awaiting Triage</CardTitle>
          <CardDescription>{filtered.length} device{filtered.length !== 1 ? 's' : ''} to inspect</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <ClipboardCheck className="h-10 w-10 mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium">No devices pending triage</p>
              <p className="text-xs mt-1">Devices will appear here after being received at COE.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IMEI</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Claimed Condition</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => {
                  const device = item.device as unknown as Record<string, string> | undefined
                  const order = item.order as unknown as { order_number?: string; created_by?: { full_name?: string } } | undefined
                  const createdBy = order?.created_by?.full_name ?? ((item.metadata as Record<string, unknown>)?.added_by_id ? 'COE (manual add)' : '—')
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.imei}</TableCell>
                      <TableCell>
                        {device ? `${device.make} ${device.model}` : '—'}
                      </TableCell>
                      <TableCell>
                        {item.claimed_condition && (
                          <span className={CONDITION_CONFIG[item.claimed_condition]?.color}>
                            {CONDITION_CONFIG[item.claimed_condition]?.label}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{order?.order_number || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{createdBy}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatRelativeTime(item.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => openTriageDialog(item)}>
                          <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />Triage
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Triage Dialog ───────────────────────────────────────────────── */}
      <Dialog open={triageDialogOpen} onOpenChange={setTriageDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Device Triage</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm">
                  <span>IMEI: <span className="font-mono font-medium">{selectedItem?.imei}</span></span>
                  {selectedItem?.claimed_condition && (
                    <span>Claimed: <span className={`font-medium ${CONDITION_CONFIG[selectedItem.claimed_condition]?.color ?? ''}`}>
                      {CONDITION_CONFIG[selectedItem.claimed_condition]?.label}
                    </span></span>
                  )}
                  {quotedPriceForItem != null && (
                    <span className="text-green-700 font-medium">Customer quoted: {formatCurrency(quotedPriceForItem)}</span>
                  )}
                </div>

                {/* IMEI Lookup inline */}
                <div className="flex items-start gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleImeiLookup}
                    disabled={isLookingUp}
                    className="text-xs h-7 shrink-0"
                  >
                    {isLookingUp ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                    Lookup IMEI
                  </Button>
                  {imeiLookup && (
                    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs space-y-1 flex-1">
                      {imeiLookup.device ? (
                        <p className="font-medium">{imeiLookup.device.make} {imeiLookup.device.model}</p>
                      ) : (
                        <p className="text-muted-foreground">{imeiLookup.note ?? 'Device not identified from TAC'}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <StatusPill value={imeiLookup.carrier_locked} label="Carrier Locked" />
                        <StatusPill value={imeiLookup.blacklisted} label="Blacklisted" />
                        <StatusPill value={imeiLookup.activation_locked} label="Activation Lock" />
                      </div>
                      {!imeiLookup.valid && (
                        <p className="text-amber-600 font-medium flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />IMEI failed Luhn check — verify manually
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <Separator />

          <div className="space-y-6 py-2">
            {/* Functional Checklist */}
            <div>
              <Label className="text-sm font-semibold">Functional Checklist ({passedCount}/{TRIAGE_CHECKLIST_ITEMS.length})</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {TRIAGE_CHECKLIST_ITEMS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => toggleChecklistItem(item.id)}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-all ${
                      checklist[item.id]
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {checklist[item.id]
                      ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                    }
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Condition Assessment */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Physical Condition</Label>
                <Select value={physicalCondition} onValueChange={v => setPhysicalCondition(v as DeviceCondition)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {conditions.map(c => <SelectItem key={c} value={c}>{CONDITION_CONFIG[c].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Screen Condition</Label>
                <Select value={screenCondition} onValueChange={setScreenCondition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {screenConditions.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Battery Health (%)</Label>
                <Input type="number" min="0" max="100" value={batteryHealth} onChange={e => setBatteryHealth(e.target.value)} />
              </div>
            </div>

            {/* Common Issues */}
            <div>
              <Label className="text-sm font-semibold">Issues Found ({issues.length})</Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {COMMON_DEVICE_ISSUES.map(issue => (
                  <button
                    key={issue}
                    onClick={() => toggleIssue(issue)}
                    className={`rounded-full px-2.5 py-1 text-xs border transition-all ${
                      issues.includes(issue)
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {issue}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Technician Notes</Label>
              <Textarea placeholder="Additional observations..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTriageDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitTriage} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Submitting...</> : 'Submit Triage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Device Dialog ───────────────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Device to Triage</DialogTitle>
            <DialogDescription>
              Manually add a device for quality inspection. Enter the IMEI and select the device model.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>IMEI / Serial Number <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Enter IMEI or serial number"
                value={addForm.imei}
                onChange={e => setAddForm(p => ({ ...p, imei: e.target.value }))}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label>Device Model <span className="text-red-500">*</span></Label>
              {selectedDevice ? (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{selectedDevice.make} {selectedDevice.model}</p>
                      <p className="text-sm text-muted-foreground">{selectedDevice.category}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDevice(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search for device (e.g., iPhone 15 Pro)"
                      className="pl-10"
                      value={deviceSearch}
                      onChange={e => setDeviceSearch(e.target.value)}
                    />
                  </div>
                  {isSearchingDevices && <p className="text-sm text-muted-foreground">Searching...</p>}
                  {deviceResults.length > 0 && (
                    <div className="border rounded-lg divide-y max-h-48 overflow-auto">
                      {deviceResults.map(device => (
                        <button
                          key={device.id}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                          onClick={() => { setSelectedDevice(device); setDeviceSearch(''); setDeviceResults([]) }}
                        >
                          <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium text-sm">{device.make} {device.model}</p>
                            <p className="text-xs text-muted-foreground">{device.category}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label>Claimed Condition</Label>
              <Select
                value={addForm.claimed_condition}
                onValueChange={v => setAddForm(p => ({ ...p, claimed_condition: v as DeviceCondition }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {conditions.map(c => (
                    <SelectItem key={c} value={c}>
                      <span className={CONDITION_CONFIG[c].color}>{CONDITION_CONFIG[c].label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Storage</Label>
                <Input placeholder="e.g., 256GB" value={addForm.storage} onChange={e => setAddForm(p => ({ ...p, storage: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input placeholder="e.g., Black" value={addForm.color} onChange={e => setAddForm(p => ({ ...p, color: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Any additional information..." value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDevice} disabled={isAdding || !selectedDevice || !addForm.imei.trim()}>
              {isAdding ? 'Adding...' : 'Add to Triage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
