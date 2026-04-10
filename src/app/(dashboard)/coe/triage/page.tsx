// ============================================================================
// COE TRIAGE PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ClipboardCheck, Search, AlertTriangle, CheckCircle2, Plus, Smartphone,
  Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, Hash, FileText,
  Upload, X, CheckCircle, XCircle, AlertCircle, PackageSearch, Trash2, Download, FileSpreadsheet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { useDebounce } from '@/hooks/useDebounce'
import { TRIAGE_CHECKLIST_ITEMS, COMMON_DEVICE_ISSUES, CONDITION_CONFIG } from '@/lib/constants'
import { buildCsvContent, buildXlsxTemplateBlob } from '@/lib/csv-templates'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import type { IMEIRecord, DeviceCondition, Device } from '@/types'

const conditions: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']
const screenConditions = ['good', 'cracked', 'damaged', 'dead'] as const
const TRIAGE_TEMPLATE_HEADERS = [
  'order_number',
  'imei',
  'serial_number',
  'make',
  'model',
  'storage',
  'condition',
  'color',
  'battery_health',
  'sim_lock',
  'locked_carrier',
  'device_cost',
  'repair_cost',
  'quantity',
  'notes',
] as const
const TRIAGE_TEMPLATE_SAMPLE = [
  ['PO-2026-0001', '359876543210001', 'SN-DEMO-001', 'Apple', 'iPhone 13', '128GB', 'good', 'Blue', '87', 'Unlocked', '', '0', '0', '1', 'Demo matched device'],
  ['PO-2026-0001', '359876543210002', 'SN-DEMO-002', 'Apple', 'iPhone 14', '128GB', 'fair', 'Black', '79', 'Locked', 'Bell', '0', '89', '1', 'Condition review example'],
  ['', '359876543210003', 'SN-DEMO-003', 'Samsung', 'Galaxy S24', '256GB', 'excellent', 'Onyx Black', '92', 'Unlocked', '', '0', '0', '1', 'Catalog-only sample row'],
] as const

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

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
  customer?: { full_name?: string; company_name?: string } | null
  items: Array<{
    id: string
    device: { id?: string; make: string; model: string } | null
    quantity: number
    claimed_condition: string
    quoted_price: number | null
    storage: string | null
  }>
}

type IntakeSlot = {
  imei: string
  actualCondition: DeviceCondition
  validation: ImeiLookupResult | null
  validating: boolean
  mismatch: 'device_model' | 'condition' | 'both' | 'duplicate' | null
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

  // ── TestPod diagnostic data ──────────────────────────────────────────────
  type TestPodResult = {
    found: boolean
    imei?: string
    serial_number?: string
    manufacturer?: string
    model_name?: string
    storage?: string
    color?: string
    os_type?: string
    os_version?: string
    battery_max_capacity_pct?: number | null
    cycle_count?: number | null
    fmi_status?: string
    mdm_status?: string
    jailbreak?: string
    gsma_blacklisted?: string
    erasure_status?: string
    carrier?: string
    sim_lock?: string | null
    cosmetic_grade?: string
    suggested_condition?: string
    screen_condition?: string
    battery_status?: string
    issues?: string[]
    checklist?: Record<string, boolean>
  }
  const [testpodData, setTestpodData] = useState<TestPodResult | null>(null)
  const [testpodLoading, setTestpodLoading] = useState(false)

  // ── Order / Quote reference lookup panel ────────────────────────────────
  const [refType, setRefType] = useState<'order' | 'quote'>('order')
  const [refInput, setRefInput] = useState('')
  const debouncedRef = useDebounce(refInput, 400)
  const [refResult, setRefResult] = useState<OrderRefResult | null>(null)
  const [refLoading, setRefLoading] = useState(false)
  const [refError, setRefError] = useState('')
  const [recentOrders, setRecentOrders] = useState<OrderRefResult[]>([])
  const [recentOrdersLoading, setRecentOrdersLoading] = useState(false)

  // ── Order Intake tab state ───────────────────────────────────────────────
  const [intakeSearch, setIntakeSearch] = useState('')
  const [intakeOrder, setIntakeOrder] = useState<OrderRefResult | null>(null)
  const [intakeOrderLoading, setIntakeOrderLoading] = useState(false)
  const [intakeOrderError, setIntakeOrderError] = useState('')
  const [intakeSlots, setIntakeSlots] = useState<Record<string, IntakeSlot[]>>({})
  const [intakeDraft, setIntakeDraft] = useState<Record<string, string>>({})
  const [intakeDraftCondition, setIntakeDraftCondition] = useState<Record<string, DeviceCondition>>({})
  const [intakeSubmitting, setIntakeSubmitting] = useState(false)
  const intakeImeiInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ── Template file upload ─────────────────────────────────────────────────
  type UploadMatchStatus = 'matched' | 'condition_mismatch' | 'not_in_order' | 'catalog_matched' | 'not_in_catalog'
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
    match_status: UploadMatchStatus
    device_id?: string | null
    matched_item?: { id: string; device: { make: string; model: string } | null; claimed_condition: string | null; quoted_price: number | null } | null
    quoted_price?: number | null
  }
  type UploadPreview = {
    detected_ref: string | null
    order: { id: string; order_number: string; status: string; total_quantity: number; quoted_amount: number | null } | null
    rows: UploadRow[]
    total: number
    matched: number
    order_matched: number
    catalog_matched: number
    ready_to_import: number
    condition_mismatches: number
    not_in_order: number
    not_in_catalog: number
  }
  const [uploadResult, setUploadResult] = useState<UploadPreview | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    duplicate?: number
    failed?: number
    missing_identifiers?: number
    errors: string[]
  } | null>(null)
  const [manualOrderRef, setManualOrderRef] = useState('')
  const [manualOrderId, setManualOrderId] = useState<string | null>(null)
  const [manualOrderLooking, setManualOrderLooking] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  const handleRecentOrderSelect = async (orderId: string) => {
    const selectedOrder = recentOrders.find(order => order.id === orderId)
    if (!selectedOrder) return

    setRefType('order')
    setRefInput(selectedOrder.order_number)
    setRefError('')
    setRefResult(null)
    setManualOrderRef(selectedOrder.order_number)
    setManualOrderId(selectedOrder.id)

    if (uploadedFile) {
      await runTemplateUpload(uploadedFile, selectedOrder.order_number).catch(() => {})
    }
  }

  const runTemplateUpload = useCallback(async (file: File, orderRef?: string) => {
    setIsUploading(true)
    setUploadError('')
    setImportResult(null)

    try {
      const form = new FormData()
      form.append('file', file)
      if (orderRef?.trim()) {
        form.append('order_ref', orderRef.trim().toUpperCase())
      }

      const res = await fetch('/api/triage/upload-template', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      setUploadResult(data)
      if (data.detected_ref) {
        setRefInput(data.detected_ref)
        setManualOrderRef(data.order?.order_number || data.detected_ref)
      }
      if (data.order?.id) {
        setManualOrderId(data.order.id)
      } else if (!orderRef) {
        setManualOrderId(null)
      }

      return data as UploadPreview
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setIsUploading(false)
    }
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadedFile(file)
    setUploadResult(null)
    await runTemplateUpload(file, manualOrderRef || undefined).catch(() => {})
  }

  const lookupManualOrder = async (ref: string) => {
    const trimmed = ref.trim().toUpperCase()
    if (!trimmed) { setManualOrderId(null); return }
    setManualOrderLooking(true)
    try {
      const res = await fetch(`/api/orders?search=${encodeURIComponent(trimmed)}&page_size=5`)
      const data = await res.json()
      const match = (data.data || []).find((o: { order_number: string; id: string }) =>
        o.order_number.toUpperCase() === trimmed
      )
      if (match) {
        setManualOrderId(match.id)
        setManualOrderRef(match.order_number)
        if (uploadedFile) {
          await runTemplateUpload(uploadedFile, match.order_number)
          toast.success(`Linked to ${match.order_number} and rematched the upload`)
        } else {
          toast.success(`Linked to ${match.order_number}`)
        }
      } else {
        setManualOrderId(null)
        toast.error('Order not found')
      }
    } catch {
      setManualOrderId(null)
    } finally { setManualOrderLooking(false) }
  }

  const handleBulkImport = async () => {
    if (!uploadResult) return
    const linkedOrderId = uploadResult.order?.id ?? manualOrderId ?? null
    const importableStatuses: UploadMatchStatus[] = linkedOrderId
      ? ['matched', 'condition_mismatch']
      : ['catalog_matched']
    const importable = uploadResult.rows.filter(
      (row) => row.imei && row.device_id && importableStatuses.includes(row.match_status)
    )
    if (importable.length === 0) {
      toast.error(linkedOrderId
        ? 'No rows matched the linked order. Check the order number and uploaded devices.'
        : 'No rows with both an IMEI and a recognized catalog device are ready to import')
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
            serial: r.serial,
            quantity: r.quantity,
            notes: r.notes,
            order_id: linkedOrderId ?? undefined,
            order_item_id: r.matched_item?.id,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setImportResult(data)
      fetchPending(true)
      if (data.imported > 0) {
        toast.success(`${data.imported} device${data.imported !== 1 ? 's' : ''} added to triage queue`)
      } else {
        const reasons: string[] = []
        if (data.duplicate) reasons.push(`${data.duplicate} duplicate`)
        if (data.missing_identifiers) reasons.push(`${data.missing_identifiers} missing IMEI/Serial`)
        if (data.failed) reasons.push(`${data.failed} failed inserts`)
        toast.error(`No devices imported${reasons.length ? ` (${reasons.join(', ')})` : ''}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk import failed')
    } finally { setIsImporting(false) }
  }

  // ── Download triage queue as CSV ────────────────────────────────────────
  const handleDownloadTriageData = () => {
    if (pendingItems.length === 0) { toast.error('No triage items to export'); return }
    const csvHeaders = ['IMEI', 'Serial', 'Make', 'Model', 'Claimed Condition', 'Actual Condition', 'Quoted Price', 'Final Price', 'Status', 'Received At']
    const rows = pendingItems.map(item => {
      const dev = item.device as unknown as Record<string, string> | null
      return [
        item.imei ?? '',
        item.serial_number ?? '',
        dev?.make ?? '',
        dev?.model ?? '',
        item.claimed_condition ?? '',
        item.actual_condition ?? '',
        item.quoted_price != null ? String(item.quoted_price) : '',
        item.final_price != null ? String(item.final_price) : '',
        item.triage_status ?? 'pending',
        item.created_at ? new Date(item.created_at).toLocaleString() : '',
      ]
    })
    const csv = [csvHeaders, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `triage-queue-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${pendingItems.length} items`)
  }

  const handleDownloadTriageTemplateCsv = () => {
    const csvContent = buildCsvContent(TRIAGE_TEMPLATE_HEADERS, TRIAGE_TEMPLATE_SAMPLE.map((row) => [...row]))
    downloadBlob(
      new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
      `triage-template-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const handleDownloadTriageTemplateExcel = async () => {
    try {
      const blob = await buildXlsxTemplateBlob(
        'Triage Template',
        TRIAGE_TEMPLATE_HEADERS,
        TRIAGE_TEMPLATE_SAMPLE.map((row) => [...row]),
      )
      downloadBlob(blob, `triage-template-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to build Excel template')
    }
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

  const fetchPending = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    try {
      const res = await fetch('/api/triage?type=pending', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setPendingItems(data.data || [])
      }
    } catch {} finally { if (!silent) setIsLoading(false) }
  }, [])

  const removePendingItem = useCallback((itemId: string) => {
    setPendingItems((prev) => prev.filter((item) => item.id !== itemId))
  }, [])

  const prependPendingItem = useCallback((item: IMEIRecord) => {
    setPendingItems((prev) => [item, ...prev.filter((existing) => existing.id !== item.id)])
  }, [])

  // Initial load + 30-second polling so all devices stay in sync
  useEffect(() => {
    fetchPending()
    const interval = setInterval(() => fetchPending(true), 30_000)
    return () => clearInterval(interval)
  }, [fetchPending])

  // Refetch immediately when user switches back to this tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchPending(true)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchPending])

  // Refetch when any DB table changes (from any device via Supabase Realtime)
  useEffect(() => {
    const handleDbChange = (e: Event) => {
      const table = (e as CustomEvent<{ table: string }>).detail?.table
      if (!table || ['imei_records', 'triage_results', 'orders', 'order_items'].includes(table)) {
        fetchPending(true)
      }
    }
    window.addEventListener('dlm:db-change', handleDbChange)
    return () => window.removeEventListener('dlm:db-change', handleDbChange)
  }, [fetchPending])

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

  useEffect(() => {
    const run = async () => {
      setRecentOrdersLoading(true)
      try {
        const res = await fetch('/api/orders?page=1&page_size=15&sort_by=created_at&sort_order=desc')
        if (!res.ok) throw new Error('Failed to load recent orders')
        const data = await res.json()
        setRecentOrders((data.data || []) as OrderRefResult[])
      } catch {
        setRecentOrders([])
      } finally {
        setRecentOrdersLoading(false)
      }
    }
    run()
  }, [])

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

  const handleLoadIntakeOrder = async () => {
    const q = intakeSearch.trim()
    if (!q) return
    setIntakeOrderLoading(true)
    setIntakeOrderError('')
    setIntakeOrder(null)
    setIntakeSlots({})
    setIntakeDraft({})
    setIntakeDraftCondition({})
    try {
      const res = await fetch(`/api/orders?search=${encodeURIComponent(q)}&page=1&page_size=1`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const match = data.data?.[0]
      if (!match) { setIntakeOrderError('No order found with that number'); return }
      const detailRes = await fetch(`/api/orders/${match.id}`)
      if (!detailRes.ok) throw new Error()
      const detail = await detailRes.json()
      const order: OrderRefResult = detail.data ?? detail
      setIntakeOrder(order)
      // Seed default condition from each item's claimed_condition
      const condMap: Record<string, DeviceCondition> = {}
      for (const item of (order.items ?? [])) {
        condMap[item.id] = (item.claimed_condition as DeviceCondition) || 'good'
      }
      setIntakeDraftCondition(condMap)
    } catch {
      setIntakeOrderError('Failed to load order. Check the order number and try again.')
    } finally { setIntakeOrderLoading(false) }
  }

  const handleAddIntakeImei = async (orderItem: OrderRefResult['items'][0]) => {
    const imei = (intakeDraft[orderItem.id] || '').trim()
    if (!imei) return
    const actualCondition = intakeDraftCondition[orderItem.id] || 'good'

    // Duplicate check within this intake session
    const alreadyEntered = Object.values(intakeSlots).flat().some(s => s.imei === imei)
    if (alreadyEntered) { toast.error('IMEI already entered in this intake session'); return }

    // Optimistically add the slot as validating
    const newSlot: IntakeSlot = { imei, actualCondition, validation: null, validating: true, mismatch: null }
    setIntakeSlots(prev => ({ ...prev, [orderItem.id]: [...(prev[orderItem.id] || []), newSlot] }))
    setIntakeDraft(prev => ({ ...prev, [orderItem.id]: '' }))
    // Re-focus the input
    setTimeout(() => intakeImeiInputRefs.current[orderItem.id]?.focus(), 50)

    try {
      const res = await fetch(`/api/imei-lookup?imei=${encodeURIComponent(imei)}`)
      const val: ImeiLookupResult = await res.json()

      // Mismatch detection
      const tacMake = (val.device?.make || '').toLowerCase()
      const tacModel = (val.device?.model || '').toLowerCase()
      const expectedMake = (orderItem.device?.make || '').toLowerCase()
      const expectedModel = (orderItem.device?.model || '').toLowerCase()
      const deviceMismatch = tacMake !== '' && expectedMake !== '' &&
        !tacMake.includes(expectedMake.split(' ')[0]) && !expectedMake.includes(tacMake.split(' ')[0])
      const condMismatch = actualCondition !== (orderItem.claimed_condition as DeviceCondition)
      const isDuplicate = !!val.existing_record

      let mismatch: IntakeSlot['mismatch'] = null
      if (isDuplicate) mismatch = 'duplicate'
      else if (deviceMismatch && condMismatch) mismatch = 'both'
      else if (deviceMismatch) mismatch = 'device_model'
      else if (condMismatch) mismatch = 'condition'

      // Suppress unused variable warnings
      void tacModel; void expectedModel

      setIntakeSlots(prev => ({
        ...prev,
        [orderItem.id]: (prev[orderItem.id] || []).map(s =>
          s.imei === imei ? { ...s, validation: val, validating: false, mismatch } : s
        ),
      }))
    } catch {
      setIntakeSlots(prev => ({
        ...prev,
        [orderItem.id]: (prev[orderItem.id] || []).map(s =>
          s.imei === imei ? { ...s, validating: false } : s
        ),
      }))
    }
  }

  const handleRemoveIntakeSlot = (orderItemId: string, imei: string) => {
    setIntakeSlots(prev => ({
      ...prev,
      [orderItemId]: (prev[orderItemId] || []).filter(s => s.imei !== imei),
    }))
  }

  const handleSubmitIntake = async () => {
    if (!intakeOrder) return
    const rows = Object.entries(intakeSlots).flatMap(([itemId, slots]) => {
      const item = intakeOrder.items.find(i => i.id === itemId)
      if (!item) return []
      return slots
        .filter(s => !s.validating && (s.mismatch === null || s.mismatch === 'condition'))
        .map(s => ({
          imei: s.imei,
          device_id: item.device?.id || null,
          claimed_condition: item.claimed_condition,
          order_id: intakeOrder.id,
          order_item_id: itemId,
          storage: item.storage || undefined,
          notes: s.mismatch ? `Intake mismatch: ${s.mismatch}` : undefined,
        }))
    })
    if (rows.length === 0) { toast.error('No valid IMEIs to register'); return }
    setIntakeSubmitting(true)
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_import', rows }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')
      if (!data.imported || data.imported === 0) {
        throw new Error('No devices were registered. Check IMEIs for duplicates and ensure exact order-item matching, including storage.')
      }
      toast.success(`${data.imported} device${data.imported !== 1 ? 's' : ''} registered to triage queue`)
      fetchPending()
      setIntakeSlots({})
      setIntakeOrder(null)
      setIntakeSearch('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed')
    } finally { setIntakeSubmitting(false) }
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
    setTestpodData(null)
    setTriageDialogOpen(true)

    // Auto-fetch TestPod diagnostics if we have an IMEI
    if (item.imei) {
      setTestpodLoading(true)
      fetch(`/api/testpod/lookup?imei=${encodeURIComponent(item.imei)}`)
        .then(r => r.json())
        .then((data: TestPodResult) => {
          setTestpodData(data)
          if (!data.found) return
          // Auto-fill battery health
          if (data.battery_max_capacity_pct != null) {
            setBatteryHealth(String(data.battery_max_capacity_pct))
          }
          // Auto-fill condition from cosmetic grade
          if (data.suggested_condition) {
            setPhysicalCondition(data.suggested_condition as DeviceCondition)
          }
          // Auto-fill screen condition
          if (data.screen_condition) {
            setScreenCondition(data.screen_condition)
          }
          // Auto-fill checklist from diagnostics
          if (data.checklist) {
            setChecklist(prev => ({ ...prev, ...data.checklist }))
          }
          // Auto-add detected issues
          if (data.issues && data.issues.length > 0) {
            setIssues(prev => [...new Set([...prev, ...data.issues!])])
          }
          // Auto-add security flags to notes
          const flags: string[] = []
          if (data.fmi_status === 'ON') flags.push('⚠️ Find My iPhone is ON')
          if (data.mdm_status === 'ON') flags.push('⚠️ MDM locked')
          if (data.jailbreak === 'ON') flags.push('⚠️ Jailbroken')
          if (data.erasure_status === 'Failed') flags.push('⚠️ Erasure NOT verified')
          if (data.gsma_blacklisted === 'Blacklisted') flags.push('🚫 GSMA Blacklisted')
          if (flags.length > 0) setNotes(flags.join('\n'))
        })
        .catch(() => setTestpodData(null))
        .finally(() => setTestpodLoading(false))
    }
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

  // Mismatch summary across all intake items
  const intakeMismatchSummary = (() => {
    const allSlots = Object.values(intakeSlots).flat()
    return {
      total: allSlots.length,
      condition: allSlots.filter(s => s.mismatch === 'condition' || s.mismatch === 'both').length,
      device: allSlots.filter(s => s.mismatch === 'device_model' || s.mismatch === 'both').length,
      duplicate: allSlots.filter(s => s.mismatch === 'duplicate').length,
      valid: allSlots.filter(s => !s.validating && s.mismatch !== 'duplicate').length,
    }
  })()

  const intakeOrderQuantityTrail = intakeOrder
    ? {
        ordered: intakeOrder.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0,
        received: Object.values(intakeSlots).flat().filter(slot => !slot.validating && slot.mismatch !== 'duplicate').length,
        mismatched: Object.values(intakeSlots).flat().filter(slot => !slot.validating && slot.mismatch !== null && slot.mismatch !== 'duplicate').length,
      }
    : null

  const uploadOrderQuantityTrail = uploadResult?.order
    ? {
        ordered: uploadResult.order.total_quantity || 0,
        received: uploadResult.ready_to_import || 0,
        mismatched: uploadResult.condition_mismatches + uploadResult.not_in_order + uploadResult.not_in_catalog,
      }
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

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">
            <ClipboardCheck className="mr-1.5 h-4 w-4" />
            Pending Queue
            {pendingItems.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{pendingItems.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="intake">
            <PackageSearch className="mr-1.5 h-4 w-4" />
            Order Intake
          </TabsTrigger>
        </TabsList>

        {/* ══ ORDER INTAKE TAB ══════════════════════════════════════════════ */}
        <TabsContent value="intake" className="space-y-4 mt-4">
          {/* Order search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <PackageSearch className="h-4 w-4 text-muted-foreground" />
                Load Order for Intake
              </CardTitle>
              <CardDescription className="text-xs">
                Enter an order number to see all expected devices and register each IMEI against its order item.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Enter order number (e.g. ORD-2026-0050)"
                    value={intakeSearch}
                    onChange={e => setIntakeSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleLoadIntakeOrder() }}
                  />
                </div>
                <Button onClick={handleLoadIntakeOrder} disabled={intakeOrderLoading || !intakeSearch.trim()}>
                  {intakeOrderLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                  {intakeOrderLoading ? 'Loading...' : 'Load Order'}
                </Button>
              </div>
              {intakeOrderError && (
                <p className="text-xs text-red-600 mt-2">{intakeOrderError}</p>
              )}
            </CardContent>
          </Card>

          {intakeOrder && (
            <>
              {/* Order summary banner */}
              <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-sm">{intakeOrder.order_number}</span>
                  <Badge variant="outline" className="text-[11px]">{intakeOrder.status.replace(/_/g, ' ')}</Badge>
                  {intakeOrder.customer && (
                    <span className="text-xs text-muted-foreground">
                      {(intakeOrder.customer as Record<string, string>).company_name || (intakeOrder.customer as Record<string, string>).full_name}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {intakeOrder.items?.reduce((s, i) => s + (i.quantity || 1), 0)} devices expected
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {intakeMismatchSummary.condition > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <AlertCircle className="h-3 w-3" />{intakeMismatchSummary.condition} condition mismatch{intakeMismatchSummary.condition !== 1 ? 'es' : ''}
                    </span>
                  )}
                  {intakeMismatchSummary.device > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <XCircle className="h-3 w-3" />{intakeMismatchSummary.device} wrong model{intakeMismatchSummary.device !== 1 ? 's' : ''}
                    </span>
                  )}
                  {intakeMismatchSummary.duplicate > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <AlertCircle className="h-3 w-3" />{intakeMismatchSummary.duplicate} duplicate{intakeMismatchSummary.duplicate !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {intakeOrderQuantityTrail && (
                <div className="rounded-lg border bg-background px-4 py-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Quantity trail:</span>{' '}
                  Order {intakeOrderQuantityTrail.ordered} · Received {intakeOrderQuantityTrail.received} · Mismatch found {intakeOrderQuantityTrail.mismatched}
                </div>
              )}

              {/* Per-item intake panels */}
              <div className="space-y-3">
                {(intakeOrder.items || []).map(item => {
                  const slots = intakeSlots[item.id] || []
                  const registered = slots.length
                  const expected = item.quantity || 1
                  const deviceLabel = item.device ? `${item.device.make} ${item.device.model}` : 'Unknown device'
                  const countColor = registered === 0 ? 'text-muted-foreground' : registered >= expected ? 'text-green-600' : 'text-amber-600'

                  return (
                    <Card key={item.id}>
                      <CardHeader className="pb-2 pt-3 px-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{deviceLabel}</span>
                            {item.storage && <span className="text-xs text-muted-foreground">({item.storage})</span>}
                            <span className={`text-xs font-medium ${CONDITION_CONFIG[item.claimed_condition as DeviceCondition]?.color || ''}`}>
                              Claimed: {CONDITION_CONFIG[item.claimed_condition as DeviceCondition]?.label || item.claimed_condition}
                            </span>
                            {item.quoted_price != null && (
                              <span className="text-xs text-muted-foreground">Quoted: {formatCurrency(item.quoted_price)}</span>
                            )}
                          </div>
                          <span className={`text-xs font-semibold tabular-nums ${countColor}`}>
                            {registered} / {expected}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 space-y-3">
                        {/* IMEI entry row */}
                        <div className="flex gap-2">
                          <Input
                            ref={el => { intakeImeiInputRefs.current[item.id] = el }}
                            placeholder="Scan or enter IMEI"
                            value={intakeDraft[item.id] || ''}
                            onChange={e => setIntakeDraft(prev => ({ ...prev, [item.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddIntakeImei(item) }}
                            className="font-mono text-sm flex-1"
                          />
                          <Select
                            value={intakeDraftCondition[item.id] || item.claimed_condition}
                            onValueChange={v => setIntakeDraftCondition(prev => ({ ...prev, [item.id]: v as DeviceCondition }))}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {conditions.map(c => (
                                <SelectItem key={c} value={c}>
                                  <span className={CONDITION_CONFIG[c].color}>{CONDITION_CONFIG[c].label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => handleAddIntakeImei(item)}
                            disabled={!(intakeDraft[item.id] || '').trim()}
                          >
                            <Plus className="h-4 w-4 mr-1" />Add
                          </Button>
                        </div>

                        {/* Registered slots list */}
                        {slots.length > 0 && (
                          <div className="rounded-lg border divide-y text-xs overflow-hidden">
                            {slots.map(slot => (
                              <div key={slot.imei} className="flex items-center gap-2 px-3 py-2">
                                <span className="font-mono flex-1 truncate">{slot.imei}</span>
                                <span className={CONDITION_CONFIG[slot.actualCondition]?.color || ''}>
                                  {CONDITION_CONFIG[slot.actualCondition]?.label || slot.actualCondition}
                                </span>
                                {slot.validating ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                ) : slot.mismatch === null ? (
                                  <span className="flex items-center gap-1 text-green-600 shrink-0">
                                    <CheckCircle className="h-3.5 w-3.5" />Matched
                                  </span>
                                ) : slot.mismatch === 'condition' ? (
                                  <span className="flex items-center gap-1 text-amber-600 shrink-0">
                                    <AlertCircle className="h-3.5 w-3.5" />Condition mismatch
                                  </span>
                                ) : slot.mismatch === 'device_model' ? (
                                  <span className="flex items-center gap-1 text-red-600 shrink-0">
                                    <XCircle className="h-3.5 w-3.5" />
                                    Wrong model{slot.validation?.device ? ` (${slot.validation.device.make})` : ''}
                                  </span>
                                ) : slot.mismatch === 'both' ? (
                                  <span className="flex items-center gap-1 text-red-600 shrink-0">
                                    <XCircle className="h-3.5 w-3.5" />Model + condition mismatch
                                  </span>
                                ) : slot.mismatch === 'duplicate' ? (
                                  <span className="flex items-center gap-1 text-blue-600 shrink-0">
                                    <AlertCircle className="h-3.5 w-3.5" />Already in system
                                  </span>
                                ) : null}
                                <button
                                  onClick={() => handleRemoveIntakeSlot(item.id, slot.imei)}
                                  className="text-muted-foreground hover:text-red-600 shrink-0"
                                  title="Remove"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {slots.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            {expected - registered} slot{expected - registered !== 1 ? 's' : ''} remaining — scan or type an IMEI above
                          </p>
                        )}
                        {slots.length > 0 && registered < expected && (
                          <p className="text-xs text-muted-foreground">
                            {expected - registered} more device{expected - registered !== 1 ? 's' : ''} expected
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Submit footer */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-sm text-muted-foreground">
                  {intakeMismatchSummary.valid} device{intakeMismatchSummary.valid !== 1 ? 's' : ''} ready to register
                  {intakeMismatchSummary.duplicate > 0 && ` (${intakeMismatchSummary.duplicate} duplicate${intakeMismatchSummary.duplicate !== 1 ? 's' : ''} skipped)`}
                </div>
                <Button
                  onClick={handleSubmitIntake}
                  disabled={intakeSubmitting || intakeMismatchSummary.valid === 0}
                >
                  {intakeSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Register {intakeMismatchSummary.valid > 0 ? intakeMismatchSummary.valid : ''} Device{intakeMismatchSummary.valid !== 1 ? 's' : ''} to Triage Queue
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ══ PENDING QUEUE TAB ═════════════════════════════════════════════ */}
        <TabsContent value="queue" className="space-y-6 mt-4">

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
          <div className="space-y-3">
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Hash className="h-3.5 w-3.5" />
                Recent Orders
              </div>
              <Select value={recentOrders.find(order => order.order_number === refInput)?.id ?? ''} onValueChange={handleRecentOrderSelect} disabled={recentOrdersLoading || recentOrders.length === 0}>
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue placeholder={recentOrdersLoading ? 'Loading recent orders...' : 'Pick a recent order'} />
                </SelectTrigger>
                <SelectContent>
                  {recentOrders.map(order => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.order_number} {order.customer?.company_name ? `· ${order.customer.company_name}` : ''} · {order.status.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {recentOrders.length === 0 && !recentOrdersLoading && (
                <p className="text-[11px] text-muted-foreground">No recent orders found.</p>
              )}
            </div>

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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4 text-muted-foreground" />
                Upload Device List (CSV / Excel)
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Upload CSV or Excel (.xlsx) with IMEI, make, model, condition, and optionally `order_number` for auto-linking.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleDownloadTriageTemplateCsv} className="flex items-center gap-1.5 text-xs shrink-0">
                <Download className="h-3.5 w-3.5" />
                CSV Template
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadTriageTemplateExcel} className="flex items-center gap-1.5 text-xs shrink-0">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel Template
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadTriageData} className="flex items-center gap-1.5 text-xs shrink-0">
                <Download className="h-3.5 w-3.5" />
                Export Queue
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Sample downloads include filled rows so you can demo order-linked matching and catalog-only imports immediately.
          </p>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="sr-only"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <div className={`flex items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm font-medium transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer'}`}>
                {isUploading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</>
                  : <><Upload className="h-4 w-4" />Choose CSV or Excel file</>
                }
              </div>
            </label>
            {uploadResult && (
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3.5 w-3.5" />{uploadResult.order_matched} order matched</span>
                {uploadResult.catalog_matched > 0 && (
                  <span className="flex items-center gap-1 text-sky-700"><PackageSearch className="h-3.5 w-3.5" />{uploadResult.catalog_matched} catalog matched</span>
                )}
                {uploadResult.condition_mismatches > 0 && (
                  <span className="flex items-center gap-1 text-amber-600"><AlertCircle className="h-3.5 w-3.5" />{uploadResult.condition_mismatches} condition mismatch{uploadResult.condition_mismatches !== 1 ? 'es' : ''}</span>
                )}
                {uploadResult.not_in_order > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-3.5 w-3.5" />{uploadResult.not_in_order} not in order</span>
                )}
                {uploadResult.not_in_catalog > 0 && (
                  <span className="flex items-center gap-1 text-rose-700"><XCircle className="h-3.5 w-3.5" />{uploadResult.not_in_catalog} not in catalog</span>
                )}
                <button onClick={() => {
                  setUploadResult(null)
                  setUploadError('')
                  setImportResult(null)
                  setUploadedFile(null)
                  setManualOrderId(null)
                  setManualOrderRef('')
                }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          </div>

          {/* Manual order number link — shown when no order auto-detected */}
          {(!uploadResult?.order) && (
            <div className="mt-3 flex items-center gap-2">
              <Input
                placeholder="Link to order number (e.g. PO-2026-0050)"
                value={manualOrderRef}
                onChange={e => { setManualOrderRef(e.target.value); setManualOrderId(null) }}
                onKeyDown={e => { if (e.key === 'Enter') lookupManualOrder(manualOrderRef) }}
                className="h-8 text-xs max-w-xs"
              />
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => lookupManualOrder(manualOrderRef)} disabled={manualOrderLooking || !manualOrderRef.trim()}>
                {manualOrderLooking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Link Order'}
              </Button>
              {manualOrderId && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" />Linked</span>}
              {!manualOrderId && manualOrderRef && !manualOrderLooking && <span className="text-xs text-muted-foreground">Linking rematches the uploaded rows against that order.</span>}
              {!manualOrderRef && <span className="text-xs text-muted-foreground">Optional — link to an existing order</span>}
            </div>
          )}

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
                    {uploadResult.total} rows parsed — {uploadResult.ready_to_import} ready to import
                  </p>
                  {uploadOrderQuantityTrail && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Quantity trail: Order {uploadOrderQuantityTrail.ordered} · Received {uploadOrderQuantityTrail.received} · Mismatch found {uploadOrderQuantityTrail.mismatched}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {importResult && (
                    <span className="text-xs text-green-700 font-medium">
                      {importResult.imported} imported, {importResult.skipped} skipped{importResult.duplicate ? `, ${importResult.duplicate} duplicate` : ''}{importResult.failed ? `, ${importResult.failed} failed` : ''}{importResult.errors.length > 0 ? `, ${importResult.errors.length} errors` : ''}
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={handleBulkImport}
                    disabled={isImporting || uploadResult.ready_to_import === 0}
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
                      <TableRow key={row.row}>
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
                          {row.match_status === 'catalog_matched' && (
                            <span className="flex items-center gap-1 text-sky-700"><PackageSearch className="h-3 w-3" />Catalog matched</span>
                          )}
                          {row.match_status === 'condition_mismatch' && (
                            <span className="flex items-center gap-1 text-amber-600"><AlertCircle className="h-3 w-3" />Condition mismatch</span>
                          )}
                          {row.match_status === 'not_in_order' && (
                            <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-3 w-3" />Not in order</span>
                          )}
                          {row.match_status === 'not_in_catalog' && (
                            <span className="flex items-center gap-1 text-rose-700"><XCircle className="h-3 w-3" />Not in catalog</span>
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

        </TabsContent>
      </Tabs>

      {/* ── Triage Dialog ───────────────────────────────────────────────── */}
      <Dialog open={triageDialogOpen} onOpenChange={(open) => {
        setTriageDialogOpen(open)
        if (!open) {
          setSelectedItem(null)
          setPhysicalCondition('good')
          setScreenCondition('good')
          setBatteryHealth('85')
          setChecklist({})
          setIssues([])
          setNotes('')
          setImeiLookup(null)
          setTestpodData(null)
        }
      }}>
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

          {/* ── TestPod Diagnostics Panel ─────────────────────────────────── */}
          {(testpodLoading || testpodData) && (
            <div className={`rounded-lg border px-4 py-3 text-xs space-y-2 ${
              testpodData?.found ? 'bg-blue-50/60 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800' : 'bg-muted/40'
            }`}>
              {testpodLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Fetching HiteKNova / TestPod diagnostics...</span>
                </div>
              )}
              {testpodData && !testpodLoading && (
                <>
                  {!testpodData.found ? (
                    <p className="text-muted-foreground">No TestPod record found for this IMEI.</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5" /> HiteKNova Diagnostics — auto-filled below
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          {testpodData.cosmetic_grade && (
                            <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 font-mono font-bold dark:bg-blue-900 dark:text-blue-200">
                              Grade {testpodData.cosmetic_grade}
                            </span>
                          )}
                          {testpodData.battery_max_capacity_pct != null && (
                            <span className={`rounded-full px-2 py-0.5 font-medium ${testpodData.battery_max_capacity_pct >= 80 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                              🔋 {testpodData.battery_max_capacity_pct}%{testpodData.cycle_count ? ` · ${testpodData.cycle_count} cycles` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                        {testpodData.carrier && <span><span className="text-muted-foreground">Carrier:</span> {testpodData.carrier}{testpodData.sim_lock ? ` (${testpodData.sim_lock})` : ''}</span>}
                        {testpodData.os_version && <span><span className="text-muted-foreground">OS:</span> {testpodData.os_type} {testpodData.os_version}</span>}
                        {testpodData.color && <span><span className="text-muted-foreground">Color:</span> {testpodData.color}</span>}
                        {testpodData.storage && <span><span className="text-muted-foreground">Storage:</span> {testpodData.storage}</span>}
                        <span>
                          <span className="text-muted-foreground">Find My:</span>{' '}
                          <span className={testpodData.fmi_status === 'ON' ? 'text-red-600 font-semibold' : 'text-green-700'}>{testpodData.fmi_status ?? '—'}</span>
                        </span>
                        <span>
                          <span className="text-muted-foreground">MDM:</span>{' '}
                          <span className={testpodData.mdm_status === 'ON' ? 'text-red-600 font-semibold' : 'text-green-700'}>{testpodData.mdm_status ?? '—'}</span>
                        </span>
                        <span>
                          <span className="text-muted-foreground">Erasure:</span>{' '}
                          <span className={testpodData.erasure_status === 'Passed' ? 'text-green-700' : 'text-red-600 font-semibold'}>{testpodData.erasure_status ?? '—'}</span>
                        </span>
                        <span>
                          <span className="text-muted-foreground">Jailbreak:</span>{' '}
                          <span className={testpodData.jailbreak === 'ON' ? 'text-red-600 font-semibold' : 'text-green-700'}>{testpodData.jailbreak ?? '—'}</span>
                        </span>
                        {testpodData.gsma_blacklisted && testpodData.gsma_blacklisted !== 'Not tested' && (
                          <span className="col-span-2">
                            <span className="text-muted-foreground">GSMA:</span>{' '}
                            <span className={testpodData.gsma_blacklisted === 'Blacklisted' ? 'text-red-600 font-bold' : 'text-green-700'}>{testpodData.gsma_blacklisted}</span>
                          </span>
                        )}
                      </div>
                      {testpodData.issues && testpodData.issues.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {testpodData.issues.map(issue => (
                            <span key={issue} className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] dark:bg-amber-900/40 dark:text-amber-300">{issue}</span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

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
      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        setAddDialogOpen(open)
        if (!open) setAddForm({ imei: '', claimed_condition: 'good', storage: '', color: '', notes: '' })
      }}>
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
