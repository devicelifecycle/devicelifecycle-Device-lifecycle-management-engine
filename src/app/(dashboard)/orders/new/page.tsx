// ============================================================================
// CREATE NEW ORDER PAGE - Unified Trade-In & CPO
// ============================================================================

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, X, Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, Files, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useOrders } from '@/hooks/useOrders'
import { useCustomers, useMyCustomer } from '@/hooks/useCustomers'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CsvUploadGuide } from '@/components/orders/CsvUploadGuide'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { CONDITION_CONFIG, STORAGE_OPTIONS } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import {
  buildCsvContent,
  buildXlsxTemplateBlob,
} from '@/lib/csv-templates'
import type { Device, DeviceCondition, CpoGrade } from '@/types'
import { CPO_GRADES, CPO_GRADE_LABELS } from '@/types'

// Column alias map — auto-corrects misspelled or alternative column names.
// Supports any CSV/Excel template without requiring a predefined format.
const COLUMN_ALIASES: Record<string, string> = {
  // ── Make / Brand ──────────────────────────────────────────────────────────
  device_make: 'device_make', make: 'device_make', brand: 'device_make', manufacturer: 'device_make',
  devcie_make: 'device_make', divice_make: 'device_make', 'device make': 'device_make', 'make*': 'device_make',
  oem: 'device_make', mfr: 'device_make', vendor: 'device_make', supplier: 'device_make',
  company: 'device_make', 'phone brand': 'device_make', 'phone make': 'device_make',
  'device brand': 'device_make', 'device manufacturer': 'device_make',
  phone_brand: 'device_make', phone_make: 'device_make',
  // ── Model ─────────────────────────────────────────────────────────────────
  device_model: 'device_model', model: 'device_model', device: 'device_model', product: 'device_model',
  devcie_model: 'device_model', divice_model: 'device_model', 'device model': 'device_model', 'model*': 'device_model',
  'phone model': 'device_model', 'model name': 'device_model', 'device name': 'device_model',
  'existing phone': 'device_model', description: 'device_model', phone_model: 'device_model',
  'device description': 'device_model', 'item description': 'device_model',
  'product description': 'device_model', 'asset description': 'device_model',
  'product name': 'device_model', 'item name': 'device_model', 'asset name': 'device_model',
  'equipment description': 'device_model', 'hardware description': 'device_model',
  'sku': 'device_model', 'sku description': 'device_model', 'part description': 'device_model',
  'part name': 'device_model', 'part number description': 'device_model',
  'equipment name': 'device_model', 'equipment model': 'device_model',
  'unit description': 'device_model', 'unit model': 'device_model',
  'article description': 'device_model', 'article name': 'device_model',
  // ── Quantity ──────────────────────────────────────────────────────────────
  quantity: 'quantity', qty: 'quantity', quantitty: 'quantity', quantiy: 'quantity', quantit: 'quantity',
  count: 'quantity', num: 'quantity', '#': 'quantity', 'device count': 'quantity',
  'count of mobile': 'quantity', volume: 'quantity', total: 'quantity',
  'unit count': 'quantity', 'units': 'quantity', 'no of units': 'quantity', 'no. of units': 'quantity',
  'number of units': 'quantity', 'total units': 'quantity', 'total devices': 'quantity',
  // ── Condition ─────────────────────────────────────────────────────────────
  condition: 'condition', condtion: 'condition', condiiton: 'condition',
  grade: 'condition', state: 'condition', 'device condition': 'condition',
  'cosmetic condition': 'condition', 'functional condition': 'condition', 'quality': 'condition',
  'item condition': 'condition', 'asset condition': 'condition', 'unit condition': 'condition',
  // ── Storage ───────────────────────────────────────────────────────────────
  storage: 'storage', 'storage/gb': 'storage', 'storage/gb*': 'storage', capacity: 'storage',
  storag: 'storage', storrage: 'storage', gb: 'storage', size: 'storage',
  'storage capacity': 'storage', 'disk size': 'storage', 'drive size': 'storage',
  'hard drive': 'storage', ssd: 'storage', 'ssd size': 'storage', 'memory size': 'storage',
  'internal storage': 'storage', 'device storage': 'storage',
  // ── Notes / Faults ────────────────────────────────────────────────────────
  notes: 'notes', faults: 'notes', 'faults/notes': 'notes', nots: 'notes', comments: 'notes',
  remarks: 'notes', observations: 'notes', issues: 'notes', defects: 'notes',
  'additional notes': 'notes', 'special notes': 'notes', 'device notes': 'notes',
  // ── Serial / IMEI ─────────────────────────────────────────────────────────
  serial_number: 'serial_number', serial: 'serial_number', imei: 'serial_number',
  serial_numbr: 'serial_number', serail_number: 'serial_number', 'sample s/n': 'serial_number',
  's/n': 'serial_number', sn: 'serial_number', 'imei/sn': 'serial_number', 'imei/serial': 'serial_number',
  'asset tag': 'serial_number', 'asset #': 'serial_number', 'asset number': 'serial_number',
  'device id': 'serial_number', 'unit id': 'serial_number', 'barcode': 'serial_number',
  'sim card': 'serial_number', 'sim': 'serial_number', 'sim #': 'serial_number',
  // ── Color ─────────────────────────────────────────────────────────────────
  color: 'color', colour: 'color', colur: 'color', 'device color': 'color', 'device colour': 'color',
  // ── Order type ────────────────────────────────────────────────────────────
  order_type: 'order_type', type: 'order_type',
}

// Condition value auto-correction (typos → canonical)
const CONDITION_TYPO_MAP: Record<string, string> = {
  excellant: 'excellent', exacellent: 'excellent', exellent: 'excellent', excelent: 'excellent',
  excellen: 'excellent', excllent: 'excellent', mint: 'excellent', 'like new': 'excellent',
  gud: 'good', gd: 'good', goo: 'good',
  fr: 'fair', average: 'fair', far: 'fair',
  brokn: 'poor', broke: 'poor', broken: 'poor', damag: 'poor', damaged: 'poor',
  crack: 'poor', cracked: 'poor', por: 'poor',
  new: 'new', sealed: 'new', unopened: 'new',
}

/** Simple Levenshtein distance for fuzzy column matching */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1))
  return dp[m][n]
}

/** Auto-correct a column header: exact alias → fuzzy match (≤2 edits) */
function normalizeHeader(raw: string): string {
  const lower = raw.toLowerCase().trim().replace(/\s+/g, ' ')
  if (COLUMN_ALIASES[lower]) return COLUMN_ALIASES[lower]
  // Fuzzy: find closest alias within 2 edits
  let best: { key: string; dist: number } | null = null
  for (const k of Object.keys(COLUMN_ALIASES)) {
    const d = levenshtein(lower, k)
    if (d <= 2 && (!best || d < best.dist)) best = { key: k, dist: d }
  }
  return best ? COLUMN_ALIASES[best.key] : raw
}

/** Auto-correct condition values */
function normalizeCondition(raw: string): string {
  if (!raw) return 'good'
  const lower = raw.toLowerCase().trim()
  if (['new', 'excellent', 'good', 'fair', 'poor', 'certified'].includes(lower)) return lower
  if (CONDITION_TYPO_MAP[lower]) return CONDITION_TYPO_MAP[lower]
  // Fuzzy match
  for (const [typo, canonical] of Object.entries(CONDITION_TYPO_MAP)) {
    if (levenshtein(lower, typo) <= 2) return canonical
  }
  return 'good' // default
}

interface CSVRow {
  device_make: string
  device_model: string
  quantity: string
  condition: string
  storage: string
  notes: string
  order_type?: string // 'trade_in' | 'cpo' - optional column
  serial_number?: string // IMEI or serial for trade-in tracking
  color?: string // Device color for identification
  device_id?: string | null  // pre-resolved from parse-trade-template
  match_status?: string      // 'matched' | 'partial' | 'auto_added' | 'unmatched'
}

interface ParsedFile {
  filename: string
  rows: CSVRow[]
  errors: string[]
}

interface LineItem {
  device_id: string
  device_label: string
  quantity: number
  condition: DeviceCondition
  cpo_grade: CpoGrade // CPO certification grade (CPO items only)
  storage: string
  notes: string
  order_type: 'trade_in' | 'cpo'
  serial_number: string // IMEI or serial for trade-in
  color: string // Device color
}

interface CompetitorPrice {
  name: string
  price: number
}

interface ItemPrice {
  engine_price: number       // raw trade-in price from engine
  engine_cpo_price: number   // raw CPO price from engine
  manual_price: string       // user override (empty = use engine)
  loading: boolean
  error: string | null
  source: string
  competitors: CompetitorPrice[]
  last_manual_price: number | null   // last price a human set for this device+storage
  last_manual_at: string | null      // when it was last set
  formula_trade_price?: number
  goRecell_fair_floor_applied?: boolean
  goRecell_fair_floor_price?: number
}

// CPO orders are certified pre-owned (their own grade, not a trade-in condition)
const CPO_CONDITION: DeviceCondition = 'certified'

function getStorageOptionsForDevice(device?: Device): string[] {
  if (!device) return STORAGE_OPTIONS

  const model = (device.model || '').toLowerCase()
  const specs = (device.specifications || {}) as { storage_options?: string[] }
  const storageOptions = specs.storage_options?.filter(Boolean)

  if (storageOptions && storageOptions.length > 0) {
    return storageOptions
  }

  if (model.includes('iphone 15')) {
    return ['128GB', '256GB', '512GB', '1TB']
  }

  return STORAGE_OPTIONS
}

export default function NewOrderPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { create, isCreating } = useOrders()
  const { customers } = useCustomers({ limit: 500 })
  const { customer: myCustomer, isLoading: myCustomerLoading, error: myCustomerError } = useMyCustomer()
  const isCustomer = user?.role === 'customer'
  const isInternal = ['admin', 'coe_manager', 'coe_tech', 'sales'].includes(user?.role || '')
  // Customers can now self-create CPO (Certified Pre-Owned purchase) orders too —
  // internal staff and customers both get the CPO order type option.
  const canCreateCpoOrder = ['admin', 'coe_manager', 'coe_tech', 'customer'].includes(user?.role || '')
  const cpoCreationBlockedMessage = 'Only admin, COE, or the customer portal can create CPO orders.'

  const [devices, setDevices] = useState<Device[]>([])
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [customerSearchResults, setCustomerSearchResults] = useState<Array<{ id: string; company_name: string }>>([])
  const customerInputRef = useRef<HTMLInputElement | null>(null)
  const customerSearchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')
  // CPO orders can be quoted in CAD or USD; the FX rate is frozen at creation.
  const [currency, setCurrency] = useState<'CAD' | 'USD'>('CAD')
  // Three independent collapsible sections (not exclusive tabs) — a user can
  // have manual items AND an uploaded file open at once. Manual Entry starts
  // open since it's the simplest path; the other two start collapsed.
  const [manualEntryOpen, setManualEntryOpen] = useState(true)
  const [downloadTemplatesOpen, setDownloadTemplatesOpen] = useState(false)
  const [uploadSpreadsheetOpen, setUploadSpreadsheetOpen] = useState(false)

  // Multi-CSV state
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const latestLookupRequestRef = useRef<Record<number, number>>({})
  const nextLookupRequestIdRef = useRef(1)
  const submittedRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isParsingFile, setIsParsingFile] = useState(false)
  const [isDraggingAdmin, setIsDraggingAdmin] = useState(false)

  // Device search state — one entry per line item
  const [deviceSearches, setDeviceSearches] = useState<Record<number, string>>({})
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState<Record<number, boolean>>({})
  const [deviceSearchResults, setDeviceSearchResults] = useState<Record<number, Device[]>>({})
  const deviceInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  // CSV preview pagination
  const [csvPreviewPage, setCsvPreviewPage] = useState(1)
  const deviceSearchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  // Auto-save draft to localStorage every 30 seconds
  const DRAFT_KEY = 'dlm_new_order_draft'
  const [hasDraft, setHasDraft] = useState(false)
  // Restore draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if ((parsed.items?.length > 0) || (parsed.parsedFiles?.length > 0) || parsed.notes) {
          setHasDraft(true)
        }
      }
    } catch { /* ignore */ }
  }, [])
  const restoreDraft = () => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved)
      // Backfill cpo_grade for drafts saved before the CPO-grade field existed,
      // so the grade <Select> stays controlled.
      if (parsed.items) setItems((parsed.items as LineItem[]).map(it => ({ ...it, cpo_grade: it.cpo_grade ?? 'certified' })))
      if (parsed.parsedFiles) setParsedFiles(parsed.parsedFiles)
      if (parsed.notes) setNotes(parsed.notes)
      setHasDraft(false)
      toast.success('Draft restored')
    } catch { toast.error('Could not restore draft') }
  }
  const discardDraft = () => { localStorage.removeItem(DRAFT_KEY); setHasDraft(false) }
  // Auto-save every 30 seconds when form has content
  useEffect(() => {
    const interval = setInterval(() => {
      if (items.length > 0 || parsedFiles.length > 0 || notes.trim()) {
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ items, parsedFiles, notes })) } catch { /* ignore */ }
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [items, parsedFiles, notes])

  // Pricing state (internal roles only)
  const [itemPrices, setItemPrices] = useState<Record<number, ItemPrice>>({})

  // Quick-add to catalog state (admin/coe_manager only)
  const [quickAddDialog, setQuickAddDialog] = useState<{ index: number; make: string; model: string } | null>(null)
  const [quickAddLoading, setQuickAddLoading] = useState(false)

  // Load a small first page of popular devices for the initial dropdown.
  // Server-side search (searchDevices) handles typed queries; this only
  // covers the empty-focus state. Previously this fetched the entire
  // catalog (500/page waterfall) causing 400ms–1.5s mount lag.
  useEffect(() => {
    let cancelled = false
    fetch('/api/devices?page_size=80&for_order_creation=1&sort_by=make&sort_order=asc')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setDevices(d.data || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // For customer role: auto-set their org's customer (no selection needed)
  useEffect(() => {
    if (isCustomer && myCustomer?.id) setCustomerId(myCustomer.id)
  }, [isCustomer, myCustomer?.id])

  // Price lookup for internal staff
  const lookupPrice = useCallback(async (index: number, deviceId: string, storage: string, condition: DeviceCondition) => {
    if (!isInternal) return
    if (!deviceId || !storage) {
      delete latestLookupRequestRef.current[index]
      setItemPrices(prev => ({ ...prev, [index]: { engine_price: 0, engine_cpo_price: 0, manual_price: '', loading: false, error: null, source: '', competitors: [], last_manual_price: null, last_manual_at: null } }))
      return
    }

    const requestId = nextLookupRequestIdRef.current++
    latestLookupRequestRef.current[index] = requestId

    setItemPrices(prev => ({ ...prev, [index]: { engine_price: 0, engine_cpo_price: 0, manual_price: '', loading: true, error: null, source: '', competitors: [], last_manual_price: null, last_manual_at: null } }))

    try {
      const [priceRes, manualRes] = await Promise.all([
        fetch('/api/pricing/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: 'v2', device_id: deviceId, storage, carrier: 'Unlocked', condition }),
        }),
        fetch(`/api/pricing/manual-prices?device_ids=${deviceId}`),
      ])

      if (latestLookupRequestRef.current[index] !== requestId) return

      // Parse last manual price — newest entry for same storage wins
      let lastManualPrice: number | null = null
      let lastManualAt: string | null = null
      if (manualRes.ok) {
        const manualData = await manualRes.json()
        const entries: Array<{ storage: string; condition: string; last_manual_price: number; last_set_at: string }> = manualData.data || []
        const sameStorage = entries
          .filter(e => e.storage === storage && (e.last_manual_price || 0) > 0)
          .sort((a, b) => (b.last_set_at || '').localeCompare(a.last_set_at || ''))
        const best = sameStorage[0] ?? entries.filter(e => (e.last_manual_price || 0) > 0).sort((a, b) => (b.last_set_at || '').localeCompare(a.last_set_at || ''))[0]
        if (best) {
          lastManualPrice = best.last_manual_price
          lastManualAt = best.last_set_at
        }
      }

      if (priceRes.ok) {
        const data = await priceRes.json()
        if (data.success && (data.trade_price > 0 || data.cpo_price > 0)) {
          if (latestLookupRequestRef.current[index] !== requestId) return
          setItemPrices(prev => ({
            ...prev,
            [index]: {
              engine_price: data.trade_price || 0,
              engine_cpo_price: data.cpo_price || 0,
              manual_price: '',
              loading: false,
              error: null,
              source: data.price_source || 'Pricing Engine V2',
              competitors: (data.competitors || []) as CompetitorPrice[],
              last_manual_price: lastManualPrice,
              last_manual_at: lastManualAt,
              formula_trade_price: data.breakdown?.formula_trade_price,
              goRecell_fair_floor_applied: data.breakdown?.goRecell_fair_floor_applied,
              goRecell_fair_floor_price: data.breakdown?.goRecell_fair_floor_price,
            },
          }))
          return
        }
      }

      if (latestLookupRequestRef.current[index] !== requestId) return
      setItemPrices(prev => ({
        ...prev,
        [index]: { engine_price: 0, engine_cpo_price: 0, manual_price: '', loading: false, error: 'No price data', source: '', competitors: [], last_manual_price: lastManualPrice, last_manual_at: lastManualAt },
      }))
    } catch {
      if (latestLookupRequestRef.current[index] !== requestId) return
      setItemPrices(prev => ({
        ...prev,
        [index]: { engine_price: 0, engine_cpo_price: 0, manual_price: '', loading: false, error: 'Lookup failed', source: '', competitors: [], last_manual_price: null, last_manual_at: null },
      }))
    }
  }, [isInternal])

  // Customer search — fires when admin types in the customer search box
  const searchCustomersFn = useCallback((query: string) => {
    clearTimeout(customerSearchTimer.current)
    const allCustomers = customers as Array<{ id: string; company_name: string }>
    if (!query.trim()) {
      setCustomerSearchResults(allCustomers)
      return
    }
    // Client-side filter first (fast, covers loaded list)
    const lower = query.toLowerCase()
    const local = allCustomers.filter(c => c.company_name.toLowerCase().includes(lower))
    setCustomerSearchResults(local)
    // Also fire server search to catch customers beyond the loaded 500
    customerSearchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(query)}&limit=100`)
        if (!res.ok) return
        const d = await res.json()
        setCustomerSearchResults(d.data || [])
      } catch { /* silently ignore */ }
    }, 250)
  }, [customers])

  // Quick-add: create a device in the catalog and auto-select it (admin/coe_manager only)
  const handleQuickAddDevice = async (make: string, model: string, index: number) => {
    setQuickAddLoading(true)
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ make: make.trim(), model: model.trim(), category: 'smartphone' }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to add device to catalog')
        return
      }
      const newDevice: Device = data
      setDevices(prev => [...prev, newDevice])
      updateItem(index, 'device_id', newDevice.id)
      setDeviceSearches(prev => ({ ...prev, [index]: `${newDevice.make} ${newDevice.model}` }))
      setDeviceDropdownOpen(prev => ({ ...prev, [index]: false }))
      setQuickAddDialog(null)
      toast.success(`${newDevice.make} ${newDevice.model} added to catalog and selected`)
    } catch {
      toast.error('Failed to add device to catalog')
    } finally {
      setQuickAddLoading(false)
    }
  }

  // Server-side device search — fires when user types in the device search box
  const searchDevices = useCallback((index: number, query: string) => {
    clearTimeout(deviceSearchTimers.current[index])
    if (!query) {
      setDeviceSearchResults(prev => { const n = { ...prev }; delete n[index]; return n })
      return
    }
    deviceSearchTimers.current[index] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/devices?search=${encodeURIComponent(query)}&page_size=60&sort_by=make&sort_order=asc`)
        if (!res.ok) return
        const d = await res.json()
        setDeviceSearchResults(prev => ({ ...prev, [index]: d.data || [] }))
      } catch { /* silently ignore */ }
    }, 200)
  }, [])

  // Manual entry helpers
  const addItem = (orderType: 'trade_in' | 'cpo') => {
    if (orderType === 'cpo' && !canCreateCpoOrder) {
      toast.error(cpoCreationBlockedMessage)
      return
    }

    setItems([...items, {
      device_id: '',
      device_label: '',
      quantity: 1,
      condition: orderType === 'cpo' ? CPO_CONDITION : 'good',
      cpo_grade: 'certified',
      storage: '',
      notes: '',
      order_type: orderType,
      serial_number: '',
      color: '',
    }])
  }

  const removeItem = (i: number) => {
    setItems(items.filter((_, idx) => idx !== i))
    latestLookupRequestRef.current = {}
    setDeviceSearches(prev => {
      const next = { ...prev }
      delete next[i]
      const reindexed: Record<number, string> = {}
      Object.keys(next).forEach(key => {
        const k = parseInt(key)
        reindexed[k > i ? k - 1 : k] = next[k]
      })
      return reindexed
    })
    setItemPrices(prev => {
      const next = { ...prev }
      delete next[i]
      const reindexed: Record<number, ItemPrice> = {}
      Object.keys(next).forEach(key => {
        const k = parseInt(key)
        reindexed[k > i ? k - 1 : k] = next[k]
      })
      return reindexed
    })
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = items.map((item, i) => {
      if (i !== index) return item
      if (field === 'device_id') {
        const dev = devices.find(d => d.id === value)
          ?? Object.values(deviceSearchResults).flat().find(d => d.id === value)
        const storageOptions = getStorageOptionsForDevice(dev)
        const defaultStorage = storageOptions.includes('128GB') ? '128GB' : storageOptions[0] || ''
        return {
          ...item,
          device_id: value as string,
          device_label: dev ? `${dev.make} ${dev.model}` : '',
          storage: defaultStorage,
        }
      }
      if (field === 'order_type' && value === 'cpo' && !canCreateCpoOrder) {
        return { ...item, order_type: 'trade_in' as const }
      }
      // When switching to CPO, lock condition to CPO_CONDITION
      if (field === 'order_type' && value === 'cpo') {
        return { ...item, order_type: 'cpo' as const, condition: CPO_CONDITION }
      }
      return { ...item, [field]: value }
    })

    setItems(newItems)

    // Trigger price lookup when device, storage, condition, or order_type changes
    if (isInternal && ['device_id', 'storage', 'condition', 'order_type'].includes(field)) {
      const updatedItem = newItems[index]
      if (updatedItem) lookupPrice(index, updatedItem.device_id, updatedItem.storage, updatedItem.condition)
    }
  }

  const updateManualPrice = (index: number, val: string) => {
    setItemPrices(prev => ({
      ...prev,
      [index]: {
        ...(prev[index] || { engine_price: 0, engine_cpo_price: 0, manual_price: '', loading: false, error: null, source: 'manual', competitors: [], last_manual_price: null, last_manual_at: null }),
        manual_price: val,
      },
    }))
  }

  const getFinalPrice = (i: number) => {
    const p = itemPrices[i]
    if (!p) return 0
    if (p.manual_price !== '' && !Number.isNaN(parseFloat(p.manual_price))) return parseFloat(p.manual_price)
    return items[i]?.order_type === 'cpo' ? p.engine_cpo_price : p.engine_price
  }

  // CSV and Excel template downloads - separate for Trade-In and CPO (demo data for Apple & Samsung)
  const handleDownloadTradeInTemplate = () => {
    const headers = ['Make', 'Model', 'quantity', 'condition', 'storage', 'serial_number', 'color', 'notes']
    const csvContent = headers.join(',')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'trade-in-template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('Trade-In template downloaded')
  }

  const handleDownloadTradeInExcelTemplate = async () => {
    const headers = ['Make', 'Model', 'quantity', 'condition', 'storage', 'serial_number', 'color', 'notes']
    const blob = await buildXlsxTemplateBlob('Trade-In Template', headers, [])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'trade-in-template.xlsx'
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('Trade-In Excel template downloaded')
  }

  const handleDownloadCpoTemplate = () => {
    const headers = ['Make', 'Model', 'quantity', 'storage', 'notes']
    const csvContent = headers.join(',')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'cpo-template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('CPO template downloaded')
  }

  const handleDownloadCpoExcelTemplate = async () => {
    const headers = ['Make', 'Model', 'quantity', 'storage', 'notes']
    const blob = await buildXlsxTemplateBlob('CPO Template', headers, [])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'cpo-template.xlsx'
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('CPO Excel template downloaded')
  }

  // Multi-CSV handling — sends file to parse-trade-template for server-side device matching
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      setIsParsingFile(true)
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/orders/parse-trade-template', { method: 'POST', body: form })
        const data = await res.json()
        if (!res.ok) {
          toast.error(`Failed to parse ${file.name}: ${data.error || 'Unknown error'}`)
          continue
        }

        type ServerRow = {
          make: string; model: string; storage: string; condition: string
          quantity: number; serials: string[]; imeis: string[]
          device_id: string | null; match_status: string
          notes?: string; color?: string
        }
        const serverRows: ServerRow[] = data.rows || []

        // Infer order type from filename; user can change per-row in the preview table
        const inferredOrderType: 'trade_in' | 'cpo' =
          file.name.toLowerCase().includes('cpo') ? 'cpo' : 'trade_in'

        const rows: CSVRow[] = serverRows.map(r => ({
          device_make: r.make || '',
          device_model: r.model || '',
          quantity: String(r.quantity || 1),
          condition: r.condition || 'good',
          storage: r.storage || '',
          notes: r.notes || '',
          order_type: inferredOrderType,
          serial_number: ([...(r.imeis || []), ...(r.serials || [])][0] ?? ''),
          color: r.color || '',
          device_id: r.device_id || null,
          match_status: r.match_status || 'unmatched',
        }))

        if (!canCreateCpoOrder && rows.some(row => row.order_type === 'cpo')) {
          toast.error(cpoCreationBlockedMessage)
          continue
        }

        setParsedFiles(prev => [...prev, { filename: file.name, rows, errors: [] }])
        setCsvPreviewPage(1)

        const unmatched = rows.filter(r => r.match_status === 'unmatched').length
        const autoAdded = rows.filter(r => r.match_status === 'auto_added').length
        if (unmatched > 0) {
          toast.warning(`${file.name}: ${rows.length} rows — ${unmatched} device(s) not in catalog (auto-added)`)
        } else if (autoAdded > 0) {
          toast.info(`${file.name}: ${rows.length} rows — ${autoAdded} new device(s) added to catalog`)
        } else {
          toast.success(`${file.name}: ${rows.length} rows parsed and matched`)
        }
      } catch {
        toast.error(`Failed to parse ${file.name}. Supported formats: CSV, TSV, Excel (.xlsx, .xls), ODS.`)
      } finally {
        setIsParsingFile(false)
      }
    }

    // Reset input
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFileDrop = (files: FileList) => {
    const syntheticEvent = { target: { files } } as unknown as React.ChangeEvent<HTMLInputElement>
    handleFileUpload(syntheticEvent)
  }

  const removeFile = (index: number) => {
    setParsedFiles(prev => prev.filter((_, i) => i !== index))
    setCsvPreviewPage(1)
  }

  // Edit a specific CSV row field (editable preview) — re-validates errors after each edit
  const editCsvRow = (fileIndex: number, rowIndex: number, field: keyof CSVRow, value: string) => {
    setParsedFiles(prev => prev.map((f, fi) => {
      if (fi !== fileIndex) return f
      const newRows = [...f.rows]
      const nextValue = field === 'order_type' && !canCreateCpoOrder ? 'trade_in' : value
      const updatedRow = { ...newRows[rowIndex], [field]: nextValue }
      // Clear pre-resolved device_id when user edits make/model — forces re-match on submit
      if (field === 'device_make' || field === 'device_model') {
        updatedRow.device_id = null
        updatedRow.match_status = 'unmatched'
      }
      newRows[rowIndex] = updatedRow
      const errors: string[] = []
      return { ...f, rows: newRows, errors }
    }))
  }

  // Delete a specific CSV row and re-validate
  const deleteCsvRow = (fileIndex: number, rowIndex: number) => {
    setParsedFiles(prev => prev.map((f, fi) => {
      if (fi !== fileIndex) return f
      const newRows = f.rows.filter((_, ri) => ri !== rowIndex)
      const errors: string[] = []
      // Brand is always set (inferred or 'Unknown') — no hard error for missing make
      return { ...f, rows: newRows, errors }
    }))
  }

  // Get all CSV rows combined (with file/row indices for editing)
  const allCsvRows = parsedFiles.flatMap((f, fi) => f.rows.map((row, ri) => ({ ...row, _fi: fi, _ri: ri })))
  const allCsvErrors = parsedFiles.flatMap(f => f.errors)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submittedRef.current) return
    setIsSubmitting(true)
    const effectiveCustomerId = isCustomer ? myCustomer?.id : customerId
    if (!effectiveCustomerId) {
      toast.error(isCustomer ? 'Loading your organization...' : 'Please select a customer')
      setIsSubmitting(false)
      return
    }

    // Combine items from manual entry and CSV. Both sections are visible at
    // once now (not exclusive tabs) — an uploaded file takes priority over
    // manual items if both are present, matching the original tab-based
    // precedence (CSV branch checked first), just driven by actual data
    // instead of which section happened to be open.
    let orderItems: { device_id: string; quantity: number; storage: string; condition: DeviceCondition; cpo_grade?: CpoGrade; notes: string; order_type: 'trade_in' | 'cpo'; serial_number?: string; color?: string; quoted_price?: number }[] = []

    if (allCsvRows.length > 0) {
      if (items.length > 0) {
        toast.warning('You have both manual items and an uploaded file — submitting the uploaded file only. Remove the file to submit manual items instead.')
      }
      // Use the upload-csv server API for full fuzzy matching (Levenshtein + aliases)
      // Split rows by order type and create separate orders
      const tradeInCsvRows = allCsvRows.filter(r => r.order_type !== 'cpo')
      const cpoCsvRows = allCsvRows.filter(r => r.order_type === 'cpo')

      if (!canCreateCpoOrder && cpoCsvRows.length > 0) {
        toast.error(cpoCreationBlockedMessage)
        setIsSubmitting(false)
        return
      }

      try {
        submittedRef.current = true
        const results: { id: string; type: string }[] = []

        for (const [orderType, csvRows] of [['trade_in', tradeInCsvRows], ['cpo', cpoCsvRows]] as const) {
          if (csvRows.length === 0) continue
          // Prepare rows as records with canonical column names for the server
          const columns = ['device_make', 'device_model', 'quantity', 'condition', 'storage', 'serial_number', 'color', 'notes']
          const apiRows = csvRows.map(row => {
            const adminFlag = !row.device_make ? '⚠ Needs admin review: make/brand not identified from upload' : ''
            const combinedNotes = [row.notes, adminFlag].filter(Boolean).join(' | ')
            return {
              device_make: row.device_make,
              device_model: row.device_model,
              quantity: row.quantity || '1',
              condition: row.condition || 'good',
              storage: row.storage || '',
              serial_number: row.serial_number || '',
              color: row.color || '',
              notes: combinedNotes,
              ...(row.device_id ? { device_id: row.device_id } : {}),
            }
          })

          const res = await fetch('/api/orders/upload-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rows: apiRows,
              columns,
              customer_id: effectiveCustomerId,
              order_type: orderType,
            }),
          })

          const data = await res.json()
          if (!res.ok) {
            const errMsg = data.error || 'Upload failed'
            const details = data.details as { row: number; message: string }[] | undefined
            if (details?.length) {
              toast.error(`${errMsg}: ${details.slice(0, 3).map((d: { row: number; message: string }) => `Row ${d.row}: ${d.message}`).join(', ')}`)
            } else {
              toast.error(errMsg)
            }
            submittedRef.current = false
            setIsSubmitting(false)
            return
          }

          results.push({ id: data.order?.id, type: orderType === 'cpo' ? 'CPO' : 'Trade-In' })
        }

        if (results.length === 1) {
          localStorage.removeItem(DRAFT_KEY)
          toast.success(`${results[0].type} order created — ${allCsvRows.length} items`)
          router.replace(isCustomer ? `/customer/orders/${results[0].id}` : `/orders/${results[0].id}`)
        } else if (results.length > 1) {
          localStorage.removeItem(DRAFT_KEY)
          toast.success(`Created ${results.length} orders: ${results.map(r => r.type).join(' & ')}`)
          router.replace(isCustomer ? '/customer/orders' : '/orders')
        }
        return
      } catch (err) {
        submittedRef.current = false
        setIsSubmitting(false)
        toast.error(err instanceof Error ? err.message : 'Failed to upload CSV')
        return
      }
    } else {
      if (items.length === 0) { toast.error('Please add at least one item'); setIsSubmitting(false); return }
      const invalidItems = items.filter(i => !i.device_id)
      if (invalidItems.length > 0) {
        toast.error('Please select a device for all items')
        setIsSubmitting(false)
        return
      }
      orderItems = items.map((i, idx) => ({
        device_id: i.device_id,
        quantity: i.quantity,
        storage: i.storage || '128GB',
        condition: i.condition,
        ...(i.order_type === 'cpo' ? { cpo_grade: i.cpo_grade } : {}),
        notes: i.notes,
        order_type: i.order_type,
        serial_number: i.serial_number || '',
        color: i.color || '',
        ...(itemPrices[idx]?.engine_price > 0 || itemPrices[idx]?.engine_cpo_price > 0 ? { quoted_price: getFinalPrice(idx) } : {}),
      }))
    }

    // Group items by order type
    const tradeInItems = orderItems.filter(i => i.order_type === 'trade_in')
    const cpoItems = orderItems.filter(i => i.order_type === 'cpo')

    if (!canCreateCpoOrder && cpoItems.length > 0) {
      toast.error(cpoCreationBlockedMessage)
      setIsSubmitting(false)
      return
    }

    submittedRef.current = true
    try {
      const results: { id: string; type: string; status?: string }[] = []

      // Create trade-in order if there are trade-in items
      if (tradeInItems.length > 0) {
        const result = await create({
          type: 'trade_in',
          customer_id: effectiveCustomerId,
          items: tradeInItems.map(({ order_type, ...rest }) => rest),
          notes: notes ? `${notes} (Trade-In)` : undefined,
        } as Record<string, unknown>)
        results.push({ id: result.id, type: 'Trade-In', status: result.status })
      }

      // Create CPO order if there are CPO items
      if (cpoItems.length > 0) {
        const result = await create({
          type: 'cpo',
          customer_id: effectiveCustomerId,
          items: cpoItems.map(({ order_type, ...rest }) => rest),
          notes: notes ? `${notes} (CPO)` : undefined,
          currency,
        } as Record<string, unknown>)
        results.push({ id: result.id, type: 'CPO', status: result.status })
      }

      // A customer order is only truly submitted once its status left 'draft'.
      // The API auto-submits customer orders but treats a failed transition as
      // non-fatal, leaving the order in 'draft' — so confirm actual status here
      // instead of always claiming the request was submitted.
      const notSubmitted = results.filter(r => r.status === 'draft')

      localStorage.removeItem(DRAFT_KEY)
      if (isCustomer && notSubmitted.length > 0) {
        toast.warning(
          `Your ${notSubmitted.map(r => r.type).join(' & ')} request was created but could NOT be submitted automatically. Please open it and press Submit, or contact support — no confirmation email has been sent yet.`,
          { duration: 8000 }
        )
        router.replace(results.length === 1 ? `/customer/orders/${results[0].id}` : '/customer/orders')
      } else if (results.length === 1) {
        toast.success(isCustomer
          ? `${results[0].type} request created and submitted — you'll receive an email confirmation shortly. Our team will send your quote soon.`
          : `${results[0].type} order created successfully`)
        router.replace(isCustomer ? `/customer/orders/${results[0].id}` : `/orders/${results[0].id}`)
      } else if (results.length === 2) {
        toast.success(isCustomer
          ? `Both requests created and submitted — you'll receive an email confirmation shortly. Our team will send your quotes soon.`
          : `Created ${results.length} orders: ${results.map(r => r.type).join(' & ')}`)
        router.replace(isCustomer ? '/customer/orders' : '/orders')
      }
    } catch (err) {
      submittedRef.current = false
      setIsSubmitting(false)
      toast.error(err instanceof Error ? err.message : 'Failed to create order')
    }
  }

  // Calculate quote totals by type
  const tradeInTotal = items.reduce((sum, item, idx) =>
    item.order_type === 'trade_in' ? sum + getFinalPrice(idx) * item.quantity : sum, 0)
  const cpoTotal = items.reduce((sum, item, idx) =>
    item.order_type === 'cpo' ? sum + getFinalPrice(idx) * item.quantity : sum, 0)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href={isCustomer ? '/customer/requests' : '/orders'}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Order</h1>
          <p className="text-muted-foreground">
            {canCreateCpoOrder
              ? 'Create trade-in or CPO orders — or both at once'
              : 'Create trade-in orders for customer intake'}
          </p>
          {user?.role === 'sales' && (
            <p className="text-sm text-amber-600 mt-1">
              Sales can only create trade-in orders. CPO orders must be placed by admin, COE, or through the customer portal.
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Unsaved draft restore banner */}
        {hasDraft && (
          <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-4 py-3 gap-3">
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
              You have an unsaved draft from a previous session.
            </p>
            <div className="flex gap-2 shrink-0">
              <Button type="button" size="sm" variant="outline" onClick={restoreDraft} className="border-amber-400 text-amber-800 hover:bg-amber-100">Restore</Button>
              <Button type="button" size="sm" variant="ghost" onClick={discardDraft} className="text-amber-600">Discard</Button>
            </div>
          </div>
        )}

        {/* Order for (info only - no selection needed) */}
        {isCustomer && myCustomer && (
          <Card>
            <CardHeader>
              <CardTitle>Order for</CardTitle>
              <CardDescription>This order will be linked to your organization</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{myCustomer.company_name}</p>
              <p className="text-sm text-muted-foreground">Track this order in My Orders once submitted.</p>
            </CardContent>
          </Card>
        )}

        {isCustomer && !myCustomerLoading && myCustomerError && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-4">
              <p className="text-sm text-destructive">
                Unable to load your organization profile. Please contact support.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Customer selection — internal staff only */}
        {!isCustomer && (
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
              <CardDescription>Select the organization this order is for</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative w-full sm:max-w-sm">
                <Input
                  ref={customerInputRef}
                  placeholder="Search customer…"
                  value={customerSearch}
                  onChange={e => {
                    setCustomerSearch(e.target.value)
                    searchCustomersFn(e.target.value)
                    setCustomerDropdownOpen(true)
                    // Clear selection when user edits the text
                    if (customerId) setCustomerId('')
                  }}
                  onFocus={() => {
                    setCustomerSearchResults(customers as Array<{ id: string; company_name: string }>)
                    setCustomerDropdownOpen(true)
                  }}
                  onBlur={() => setTimeout(() => setCustomerDropdownOpen(false), 150)}
                  autoComplete="off"
                />
                {customerDropdownOpen && (() => {
                  const rect = customerInputRef.current?.getBoundingClientRect()
                  if (!rect) return null
                  const results = customerSearchResults.length > 0
                    ? customerSearchResults
                    : (customers as Array<{ id: string; company_name: string }>)
                  return createPortal(
                    <div
                      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
                      className="max-h-56 overflow-y-auto rounded-md border bg-popover shadow-lg"
                    >
                      {results.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">No customers found</p>
                      ) : results.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${c.id === customerId ? 'bg-accent font-medium' : ''}`}
                          onMouseDown={e => {
                            e.preventDefault()
                            setCustomerId(c.id)
                            setCustomerSearch(c.company_name)
                            setCustomerDropdownOpen(false)
                          }}
                        >
                          {c.company_name}
                        </button>
                      ))}
                    </div>,
                    document.body
                  )
                })()}
              </div>
              {!customerId && customerSearch && (
                <p className="text-xs text-amber-600 mt-1.5">Select a customer from the list above.</p>
              )}
              {!customerId && !customerSearch && (
                <p className="text-xs text-muted-foreground mt-1.5">Required before submitting the order.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Devices - Manual or CSV */}
        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>
              {canCreateCpoOrder
                ? 'Add devices manually or upload CSV files'
                : 'Add trade-in devices manually or upload a trade-in CSV file'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Section 1: Manual Entry */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setManualEntryOpen(prev => !prev)}
                className="flex w-full items-center justify-between gap-2 p-4 text-left"
              >
                <span className="font-semibold text-sm">1. Manual Entry</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${manualEntryOpen ? 'rotate-180' : ''}`} />
              </button>
              {manualEntryOpen && (
                <div className="space-y-4 px-4 pb-4">
                <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-sm text-muted-foreground">
                    {canCreateCpoOrder ? 'Add Trade-In and/or CPO items to your order:' : 'Add trade-in items to your order:'}
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => addItem('trade_in')} className="bg-green-600 hover:bg-green-700 text-white">
                      <Plus className="mr-2 h-3 w-3" />Trade-In Item
                    </Button>
                    {canCreateCpoOrder && (
                      <Button type="button" size="sm" onClick={() => addItem('cpo')} className="bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="mr-2 h-3 w-3" />CPO Item
                      </Button>
                    )}
                  </div>
                </div>
                {items.length === 0 ? (
                  <p className="text-center py-6 font-semibold text-muted-foreground">No items added yet. Click the Trade-In Item button above to add devices.</p>
                ) : (
                  items.map((item, index) => {
                    const selectedDevice = devices.find(d => d.id === item.device_id)
                      ?? Object.values(deviceSearchResults).flat().find(d => d.id === item.device_id)
                    const storageOptions = getStorageOptionsForDevice(selectedDevice)
                    const price = itemPrices[index]

                    return (
                      <div key={index}>
                        {index > 0 && <Separator className="mb-3" />}
                        <div className="flex items-start gap-3">
                          <div className="flex-1 space-y-2">
                            {/* Row 1: Type, Device, Qty, Condition (trade-in only), Storage */}
                            <div className={`grid gap-2 ${isInternal ? 'sm:grid-cols-7' : 'sm:grid-cols-6'}`}>
                              {/* Order Type Badge */}
                              {canCreateCpoOrder ? (
                                <Select value={item.order_type} onValueChange={v => updateItem(index, 'order_type', v)}>
                                  <SelectTrigger className={item.order_type === 'cpo'
                                    ? 'border-2 border-blue-600 bg-blue-100 text-blue-800 font-medium'
                                    : 'border-2 border-green-600 bg-green-100 text-green-800 font-medium'
                                  }>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="trade_in">
                                      <span className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                        Trade-In
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="cpo">
                                      <span className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                        CPO
                                      </span>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="flex h-10 items-center rounded-md border-2 border-green-600 bg-green-100 px-3 text-sm font-medium text-green-800">
                                  Trade-In
                                </div>
                              )}
                              <div className="relative col-span-2">
                                <Input
                                  ref={el => { deviceInputRefs.current[index] = el }}
                                  placeholder="Search device..."
                                  value={deviceSearches[index] !== undefined ? deviceSearches[index] : item.device_label}
                                  onChange={e => {
                                    setDeviceSearches(prev => ({ ...prev, [index]: e.target.value }))
                                    searchDevices(index, e.target.value)
                                    setDeviceDropdownOpen(prev => ({ ...prev, [index]: true }))
                                  }}
                                  onFocus={() => {
                                    setDeviceDropdownOpen(prev => ({ ...prev, [index]: true }))
                                  }}
                                  onBlur={() => setTimeout(() => setDeviceDropdownOpen(prev => ({ ...prev, [index]: false })), 150)}
                                  autoComplete="off"
                                />
                                {deviceDropdownOpen[index] && (() => {
                                  const inputEl = deviceInputRefs.current[index]
                                  const rect = inputEl?.getBoundingClientRect()
                                  if (!rect) return null
                                  const q = (deviceSearches[index] || '').toLowerCase()
                                  const serverResults = deviceSearchResults[index]
                                  const fuzzyMatch = (device: Device) => {
                                    if (!q) return true
                                    const text = `${device.make} ${device.model}`.toLowerCase()
                                    const tokens = q.trim().split(/\s+/).filter((s: string) => s)
                                    return tokens.every((token: string) => text.includes(token))
                                  }
                                  const filtered = (serverResults !== undefined
                                    ? serverResults
                                    : q ? devices.filter(fuzzyMatch) : devices
                                  ).slice(0, 50)
                                  const content = filtered.length === 0 ? (() => {
                                    const canQuickAdd = ['admin', 'coe_manager'].includes(user?.role || '')
                                    return (
                                      <div>
                                        <p className="px-3 py-2 text-sm text-muted-foreground">No devices found</p>
                                        {canQuickAdd && q && (
                                          <button
                                            type="button"
                                            className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-accent border-t flex items-center gap-2"
                                            onMouseDown={e => {
                                              e.preventDefault()
                                              const parts = q.trim().split(/\s+/)
                                              const parsedMake = parts.length > 1 ? parts[0] : ''
                                              const parsedModel = parts.length > 1 ? parts.slice(1).join(' ') : q
                                              setQuickAddDialog({ index, make: parsedMake, model: parsedModel })
                                              setDeviceDropdownOpen(prev => ({ ...prev, [index]: false }))
                                            }}
                                          >
                                            <Plus className="h-3 w-3 shrink-0" />
                                            Add &ldquo;{q}&rdquo; to catalog
                                          </button>
                                        )}
                                      </div>
                                    )
                                  })() : filtered.map(d => (
                                    <button
                                      key={d.id}
                                      type="button"
                                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${d.id === item.device_id ? 'bg-accent font-medium' : ''}`}
                                      onMouseDown={e => {
                                        e.preventDefault()
                                        updateItem(index, 'device_id', d.id)
                                        setDeviceSearches(prev => ({ ...prev, [index]: `${d.make} ${d.model}` }))
                                        setDeviceDropdownOpen(prev => ({ ...prev, [index]: false }))
                                      }}
                                    >
                                      {d.make} {d.model}
                                    </button>
                                  ))
                                  return createPortal(
                                    <div
                                      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
                                      className="max-h-56 overflow-y-auto rounded-md border bg-popover shadow-lg"
                                    >
                                      {content}
                                    </div>,
                                    document.body
                                  )
                                })()}
                              </div>
                              <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} placeholder="Qty" />
                              {item.order_type !== 'cpo' ? (
                                <Select value={item.condition} onValueChange={v => updateItem(index, 'condition', v)}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(CONDITION_CONFIG).filter(([k]) => k !== 'certified').map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Select value={item.cpo_grade} onValueChange={v => updateItem(index, 'cpo_grade', v)}>
                                  <SelectTrigger className="border-blue-300 bg-blue-50 text-blue-800"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {CPO_GRADES.map(g => <SelectItem key={g} value={g}>{CPO_GRADE_LABELS[g]}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              )}
                              <Select value={item.storage} onValueChange={v => updateItem(index, 'storage', v)}>
                                <SelectTrigger><SelectValue placeholder="Storage" /></SelectTrigger>
                                <SelectContent>
                                  {storageOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {/* Unit Price (internal only) */}
                              {isInternal && (
                                <div className="flex flex-col">
                                  {price?.loading ? (
                                    <div className="flex items-center h-10 px-3">
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    </div>
                                  ) : price?.engine_price > 0 || price?.engine_cpo_price > 0 ? (
                                    <div className="space-y-0.5">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="text-right font-mono"
                                        placeholder={String(item.order_type === 'cpo' ? price.engine_cpo_price : price.engine_price)}
                                        value={price.manual_price}
                                        onChange={e => updateManualPrice(index, e.target.value)}
                                      />
                                      <span className="text-[10px] text-muted-foreground">{price.source}</span>
                                      {price.last_manual_price != null && (
                                        <span className="text-[10px] text-amber-600 font-medium">
                                          Last manual: {formatCurrency(price.last_manual_price)}
                                        </span>
                                      )}
                                    </div>
                                  ) : price?.error ? (
                                    <span className="text-xs text-muted-foreground h-10 flex items-center">No price</span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground h-10 flex items-center">Unit price</span>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* Row 2: Serial/IMEI and Color (only for Trade-In) */}
                            {item.order_type === 'trade_in' && (
                              <div className="grid gap-2 sm:grid-cols-3">
                                <Input 
                                  value={item.serial_number || ''} 
                                  onChange={e => updateItem(index, 'serial_number', e.target.value)} 
                                  placeholder="IMEI / Serial Number"
                                  className="font-mono text-sm"
                                />
                                <Input 
                                  value={item.color || ''} 
                                  onChange={e => updateItem(index, 'color', e.target.value)} 
                                  placeholder="Color (e.g., Midnight, Silver)"
                                />
                                <Input 
                                  value={item.notes || ''} 
                                  onChange={e => updateItem(index, 'notes', e.target.value)} 
                                  placeholder="Notes (optional)"
                                />
                              </div>
                            )}
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}><X className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    )
                  })
                )}
                </div>
              )}
            </div>

            {/* Section 2: Download Templates */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setDownloadTemplatesOpen(prev => !prev)}
                className="flex w-full items-center justify-between gap-2 p-4 text-left"
              >
                <span className="font-semibold text-sm">2. Download Templates</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${downloadTemplatesOpen ? 'rotate-180' : ''}`} />
              </button>
              {downloadTemplatesOpen && (
                <div className="space-y-3 px-4 pb-4">
                  <p className="text-sm text-muted-foreground">
                    Download one of our two templates and record your assets in this format. This ensures compliance with the required fields for best accuracy.
                  </p>
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                    <p className="font-semibold text-sm">
                      {canCreateCpoOrder ? 'Choose the correct template for your order type:' : 'Use the trade-in template for customer intake:'}
                    </p>
                    <div className={`grid gap-4 text-left ${canCreateCpoOrder ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
                      <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 p-3">
                        <p className="font-medium text-green-800 dark:text-green-300 text-sm">Trade-In Template</p>
                        <p className="text-xs text-muted-foreground mt-0.5">For device buybacks. CSV and Excel templates are available.</p>
                      </div>
                      {canCreateCpoOrder && (
                        <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3">
                          <p className="font-medium text-blue-800 dark:text-blue-300 text-sm">CPO Template</p>
                          <p className="text-xs text-muted-foreground mt-0.5">For Certified Pre-Owned purchases. CSV and Excel templates are available.</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={handleDownloadTradeInTemplate} className="border-green-600 text-green-700 hover:bg-green-50">
                      <Download className="mr-2 h-4 w-4" />Download CSV Template
                    </Button>
                    <Button type="button" variant="outline" onClick={handleDownloadTradeInExcelTemplate} className="border-green-600 text-green-700 hover:bg-green-50">
                      <FileSpreadsheet className="mr-2 h-4 w-4" />Download Trade-In Excel Template
                    </Button>
                    {canCreateCpoOrder && (
                      <Button type="button" variant="outline" onClick={handleDownloadCpoTemplate} className="border-blue-600 text-blue-700 hover:bg-blue-50">
                        <Download className="mr-2 h-4 w-4" />Download CPO Template
                      </Button>
                    )}
                    {canCreateCpoOrder && (
                      <Button type="button" variant="outline" onClick={handleDownloadCpoExcelTemplate} className="border-blue-600 text-blue-700 hover:bg-blue-50">
                        <FileSpreadsheet className="mr-2 h-4 w-4" />Download CPO Excel Template
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Upload Custom Spreadsheet */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setUploadSpreadsheetOpen(prev => !prev)}
                className="flex w-full items-center justify-between gap-2 p-4 text-left"
              >
                <span className="font-semibold text-sm">3. Upload Custom Spreadsheet</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${uploadSpreadsheetOpen ? 'rotate-180' : ''}`} />
              </button>
              {uploadSpreadsheetOpen && (
                <div className="space-y-4 px-4 pb-4">
                <CsvUploadGuide defaultOpen={isCustomer} />

                <div
                  className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${isDraggingAdmin ? 'border-primary bg-primary/5' : 'border-muted'}`}
                  onDragOver={e => { e.preventDefault(); setIsDraggingAdmin(true) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingAdmin(false) }}
                  onDrop={e => { e.preventDefault(); setIsDraggingAdmin(false); if (e.dataTransfer.files.length) handleFileDrop(e.dataTransfer.files) }}
                >
                  <Files className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    {isDraggingAdmin ? 'Drop your file here' : canCreateCpoOrder ? 'Drag & drop a file here, or use the button below.' : 'Drag & drop a trade-in file here, or use the button below.'}
                  </p>
                  <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods" multiple onChange={handleFileUpload} className="hidden" />
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button type="button" variant="outline" onClick={() => !isParsingFile && fileRef.current?.click()} disabled={isParsingFile}>
                      {isParsingFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {isParsingFile ? 'Parsing…' : 'Upload Excel or CSV'}
                    </Button>
                  </div>
                </div>

                {/* Uploaded files list */}
                {parsedFiles.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Uploaded Files ({parsedFiles.length})</p>
                    {parsedFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{file.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.rows.length} rows
                              {file.errors.length > 0 && <span className="text-amber-600"> • {file.errors.length} flagged for review</span>}
                            </p>
                          </div>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeFile(i)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Category summary — grouped by Make + Model with total units */}
                {allCsvRows.length > 0 && (() => {
                  const grouped = new Map<string, number>()
                  for (const row of allCsvRows) {
                    const key = `${row.device_make || 'Unknown'} ${row.device_model || ''}`.trim()
                    const qty = parseInt(row.quantity || '1', 10) || 1
                    grouped.set(key, (grouped.get(key) || 0) + qty)
                  }
                  const totalUnits = Array.from(grouped.values()).reduce((s, v) => s + v, 0)
                  return (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/20 p-3">
                      <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-2">
                        Order summary — {grouped.size} model{grouped.size !== 1 ? 's' : ''}, {totalUnits} total unit{totalUnits !== 1 ? 's' : ''}
                      </p>
                      <div className="space-y-0.5">
                        {Array.from(grouped.entries()).map(([name, qty]) => (
                          <div key={name} className="flex items-center justify-between text-xs">
                            <span className="text-blue-700 dark:text-blue-300 font-medium truncate max-w-[70%]">{name}</span>
                            <span className="font-mono font-semibold text-blue-900 dark:text-blue-100 shrink-0">{qty} unit{qty !== 1 ? 's' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {allCsvErrors.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      {allCsvErrors.length} row{allCsvErrors.length !== 1 ? 's' : ''} flagged for admin review
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">
                      These rows are missing a make/brand. The file will still submit — a &ldquo;⚠ Needs admin review&rdquo; note will be added to those items so your team can follow up.
                    </p>
                    {allCsvErrors.slice(0, 5).map((err, i) => <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{err}</p>)}
                    {allCsvErrors.length > 5 && <p className="text-xs text-amber-600">…and {allCsvErrors.length - 5} more — visible in the table below</p>}
                  </div>
                )}

                {allCsvRows.length > 0 && (() => {
                  const qtyOnlyRows = allCsvRows.filter(r => !r.device_make && !r.device_model && r.quantity)
                  return (
                  <>
                    {qtyOnlyRows.length > 0 && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                          {qtyOnlyRows.length} row{qtyOnlyRows.length > 1 ? 's' : ''} with quantity but no device name
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          These rows were found in your file with a quantity but no make or model. They are highlighted below — click the Make and Model cells to fill in the device info, or delete the rows you don&apos;t need.
                        </p>
                      </div>
                    )}
                  </>
                  )
                })()}

                {allCsvRows.length > 0 && (() => {
                  const PAGE_SIZE = 50
                  const totalPages = Math.ceil(allCsvRows.length / PAGE_SIZE)
                  const pageStart = (csvPreviewPage - 1) * PAGE_SIZE
                  const pageEnd = pageStart + PAGE_SIZE
                  const pageRows = allCsvRows.slice(pageStart, pageEnd)
                  return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">Editable Preview ({allCsvRows.length} rows)</p>
                      <p className="text-xs text-muted-foreground">Click any cell to edit. Fix spelling, change values, or delete rows.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[90px]">Type</TableHead>
                            <TableHead className="w-[60px]">Match</TableHead>
                            <TableHead>Make</TableHead>
                            <TableHead>Model</TableHead>
                            <TableHead className="w-[70px]">Qty</TableHead>
                            <TableHead className="w-[110px]">Condition</TableHead>
                            <TableHead className="w-[100px]">Storage</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageRows.map((row, i) => {
                            const isQtyOnly = !row.device_make && !row.device_model && !!row.quantity
                            const isFlagged = !row.device_make
                            return (
                            <TableRow key={i} className={isQtyOnly ? 'bg-amber-50/60 dark:bg-amber-950/20' : isFlagged ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                              <TableCell className="p-1">
                                {canCreateCpoOrder ? (
                                  <Select value={row.order_type || 'trade_in'} onValueChange={v => editCsvRow(row._fi, row._ri, 'order_type', v)}>
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="trade_in">Trade-In</SelectItem>
                                      <SelectItem value="cpo">CPO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <div className="flex h-8 items-center rounded-md border border-green-200 bg-green-50 px-2 text-xs font-medium text-green-800">
                                    Trade-In
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="p-1">
                                {row.match_status === 'matched' ? (
                                  <Badge variant="outline" className="text-[10px] border-green-400 text-green-700 bg-green-50 px-1">✓</Badge>
                                ) : row.match_status === 'partial' ? (
                                  <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50 px-1">~</Badge>
                                ) : row.match_status === 'auto_added' ? (
                                  <Badge variant="outline" className="text-[10px] border-blue-400 text-blue-700 bg-blue-50 px-1">+</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] border-slate-400 text-slate-500 px-1">?</Badge>
                                )}
                              </TableCell>
                              <TableCell className="p-1">
                                <Input className="h-8 text-xs" value={row.device_make} onChange={e => editCsvRow(row._fi, row._ri, 'device_make', e.target.value)} placeholder="Apple" />
                              </TableCell>
                              <TableCell className="p-1">
                                <Input className="h-8 text-xs" value={row.device_model} onChange={e => editCsvRow(row._fi, row._ri, 'device_model', e.target.value)} placeholder="iPhone 15" />
                              </TableCell>
                              <TableCell className="p-1">
                                <Input className="h-8 text-xs text-center" type="number" min={1} value={row.quantity} onChange={e => editCsvRow(row._fi, row._ri, 'quantity', e.target.value)} />
                              </TableCell>
                              <TableCell className="p-1">
                                <Select value={row.condition || 'good'} onValueChange={v => editCsvRow(row._fi, row._ri, 'condition', v)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(CONDITION_CONFIG).filter(([k]) => k !== 'certified').map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="p-1">
                                <Select value={row.storage || '128GB'} onValueChange={v => editCsvRow(row._fi, row._ri, 'storage', v)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STORAGE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="p-1">
                                <Input className="h-8 text-xs" value={row.notes || ''} onChange={e => editCsvRow(row._fi, row._ri, 'notes', e.target.value)} placeholder="Notes" />
                              </TableCell>
                              <TableCell className="p-1">
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCsvRow(row._fi, row._ri)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-3">
                        <p className="text-xs text-muted-foreground">
                          Rows {pageStart + 1}–{Math.min(pageEnd, allCsvRows.length)} of {allCsvRows.length} &bull; All rows will be submitted
                        </p>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button" variant="outline" size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={csvPreviewPage === 1}
                            onClick={() => setCsvPreviewPage(p => Math.max(1, p - 1))}
                          >‹</Button>
                          {Array.from({ length: totalPages }, (_, pi) => pi + 1)
                            .filter(p => p === 1 || p === totalPages || Math.abs(p - csvPreviewPage) <= 1)
                            .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                              if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…')
                              acc.push(p)
                              return acc
                            }, [])
                            .map((p, idx) =>
                              p === '…'
                                ? <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                                : <Button
                                    key={p}
                                    type="button"
                                    variant={csvPreviewPage === p ? 'default' : 'outline'}
                                    size="sm"
                                    className="h-7 w-7 p-0 text-xs"
                                    onClick={() => setCsvPreviewPage(p as number)}
                                  >{p}</Button>
                            )}
                          <Button
                            type="button" variant="outline" size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={csvPreviewPage === totalPages}
                            onClick={() => setCsvPreviewPage(p => Math.min(totalPages, p + 1))}
                          >›</Button>
                        </div>
                      </div>
                    )}
                    {totalPages <= 1 && allCsvRows.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">All {allCsvRows.length} rows shown. All will be submitted.</p>
                    )}
                  </div>
                  )
                })()}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quote Summary (internal staff only, manual entry) */}
        {isInternal && items.length > 0 && (tradeInTotal > 0 || cpoTotal > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quote Summary</CardTitle>
              <CardDescription>Review pricing before submitting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Cond.</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right text-muted-foreground">Suggested</TableHead>
                    <TableHead className="text-right text-amber-600">Last Manual</TableHead>
                    <TableHead className="text-right text-amber-700 bg-amber-50/60">Competitor Prices</TableHead>
                    <TableHead className="text-right">Our Quote</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => {
                    const price = itemPrices[i]
                    const enginePrice = item.order_type === 'cpo' ? (price?.engine_cpo_price || 0) : (price?.engine_price || 0)
                    if (enginePrice <= 0 && !price?.manual_price) return null
                    const finalPrice = getFinalPrice(i)
                    const isManual = price?.manual_price !== '' && !Number.isNaN(parseFloat(price?.manual_price || ''))
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant={item.order_type === 'cpo' ? 'default' : 'secondary'} className="whitespace-nowrap">
                            {item.order_type === 'cpo' ? 'CPO' : 'Trade-In'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{item.device_label || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">{item.order_type === 'cpo' ? 'Good' : item.condition}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{item.storage}</TableCell>
                        <TableCell className="text-right text-xs">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{enginePrice > 0 ? formatCurrency(enginePrice) : '—'}</TableCell>
                        {/* Last manual price */}
                        <TableCell className="text-right">
                          {price?.last_manual_price != null ? (
                            <div>
                              <span className="font-mono text-xs font-medium text-blue-600 dark:text-blue-400">{formatCurrency(price.last_manual_price)}</span>
                              {price.last_manual_at && (
                                <div className="text-[10px] text-muted-foreground">{new Date(price.last_manual_at).toLocaleDateString()}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {/* Competitor prices — internal only */}
                        <TableCell className="bg-slate-50/60 dark:bg-slate-800/30 min-w-[200px]">
                          {price?.competitors && price.competitors.length > 0 ? (() => {
                            const isBellTelus = (n: string) => { const l = n.toLowerCase(); return l === 'bell' || l === 'telus' }
                            const isGoRecellName = (n: string) => { const l = n.toLowerCase(); return l.includes('gorecell') || l.includes('go recell') }
                            // Deduplicate: keep highest price per competitor name
                            const seen = new Map<string, CompetitorPrice>()
                            for (const c of price.competitors) {
                              const ex = seen.get(c.name)
                              if (!ex || c.price > ex.price) seen.set(c.name, c)
                            }
                            const deduped = Array.from(seen.values())
                            const carriers = deduped.filter(c => isBellTelus(c.name))
                            const goRecell = deduped.find(c => isGoRecellName(c.name))
                            const carrierAvg = carriers.length > 0
                              ? carriers.reduce((s, c) => s + c.price, 0) / carriers.length : 0
                            return (
                              <div className="space-y-0.5 text-[11px]">
                                {/* Carrier rows — blue */}
                                {carriers.map(c => (
                                  <div key={c.name} className="flex items-center justify-between gap-2">
                                    <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[90px]">{c.name}</span>
                                    <span className="font-mono text-blue-700 dark:text-blue-300">{formatCurrency(c.price)}</span>
                                  </div>
                                ))}
                                {carriers.length >= 2 && (
                                  <div className="flex items-center justify-between gap-2 border-t-2 border-blue-200 dark:border-blue-700 pt-1 mt-0.5">
                                    <span className="text-slate-900 dark:text-slate-100 font-bold text-[11px]">Carrier avg</span>
                                    <span className="font-mono font-bold text-blue-700 dark:text-blue-300">{formatCurrency(carrierAvg)}</span>
                                  </div>
                                )}
                                {/* GoRecell row — emerald */}
                                {goRecell && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold truncate max-w-[90px]">{goRecell.name}</span>
                                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(goRecell.price)}</span>
                                  </div>
                                )}
                                {/* Final formula result — violet */}
                                <div className="border-t border-slate-300 dark:border-slate-600 pt-0.5 mt-0.5 space-y-0.5">
                                  {price?.goRecell_fair_floor_applied && price?.formula_trade_price != null ? (
                                    <>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-slate-600 dark:text-slate-400 font-medium">
                                          {carrierAvg > 0 && goRecell ? '(carr + GoRecell) ÷ 2' : 'GoRecell'}
                                        </span>
                                        <span className="font-mono text-slate-500 dark:text-slate-400 line-through">{formatCurrency(price.formula_trade_price)}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-orange-700 dark:text-orange-400 font-semibold text-[10px]">GoRecell floor ↑</span>
                                        <span className="font-mono font-bold text-violet-700 dark:text-violet-300">{formatCurrency(enginePrice)}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-slate-800 dark:text-slate-200 font-semibold">
                                        {carrierAvg > 0 && goRecell ? '(carr + GoRecell) ÷ 2' : 'GoRecell'}
                                      </span>
                                      <span className="font-mono font-bold text-violet-700 dark:text-violet-300">{formatCurrency(enginePrice)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })() : (
                            <span className="text-xs text-muted-foreground">No data</span>
                          )}
                        </TableCell>
                        {/* Editable final price */}
                        <TableCell className="text-right">
                          <div className="relative w-24 ml-auto">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={String(enginePrice)}
                              value={price?.manual_price || ''}
                              onChange={e => updateManualPrice(i, e.target.value)}
                              className="text-right font-mono font-semibold h-8 pr-1"
                            />
                          </div>
                          {isManual && (
                            <div className="text-[10px] text-blue-600 text-right mt-0.5">manual</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium whitespace-nowrap">{formatCurrency(finalPrice * item.quantity)}</TableCell>
                      </TableRow>
                    )
                  })}
                  {tradeInTotal > 0 && (
                    <TableRow className="border-t-2">
                      <TableCell colSpan={9} className="text-right font-semibold">Trade-In Total</TableCell>
                      <TableCell className="text-right font-mono font-bold text-green-600">{formatCurrency(tradeInTotal)}</TableCell>
                    </TableRow>
                  )}
                  {cpoTotal > 0 && (
                    <TableRow className="border-t-2">
                      <TableCell colSpan={9} className="text-right font-semibold">CPO Total</TableCell>
                      <TableCell className="text-right font-mono font-bold text-blue-600">{formatCurrency(cpoTotal)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Competitor prices are for internal reference only. Edit <span className="font-medium">Our Quote</span> per item to override the engine price.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Quote currency — CPO only */}
        {items.some(i => i.order_type === 'cpo') && (
          <Card>
            <CardHeader><CardTitle>Quote Currency</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                {(['CAD', 'USD'] as const).map(c => (
                  <Button
                    key={c}
                    type="button"
                    variant={currency === c ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrency(c)}
                  >
                    {c}
                  </Button>
                ))}
                <p className="ml-2 text-xs text-muted-foreground">
                  {currency === 'USD'
                    ? 'USD is converted at the Bank of Canada rate, frozen when the order is created.'
                    : 'Amounts are quoted in Canadian dollars.'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <Textarea placeholder="Any additional notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="success"
            disabled={isCreating || isSubmitting || (isCustomer && (myCustomerLoading || !myCustomer || !!myCustomerError))}
          >
            {isCreating || isSubmitting ? 'Creating...' : 'Create Order'}
          </Button>
          <Link href={isCustomer ? '/customer/requests' : '/orders'}>
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
        </div>
      </form>

      {/* Quick-add device to catalog dialog (admin/coe_manager only) */}
      <Dialog open={!!quickAddDialog} onOpenChange={open => { if (!open) setQuickAddDialog(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Device to Catalog</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="qa-make">Make / Brand</Label>
              <Input
                id="qa-make"
                placeholder="e.g. Apple"
                value={quickAddDialog?.make || ''}
                onChange={e => setQuickAddDialog(s => s ? { ...s, make: e.target.value } : null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-model">Model</Label>
              <Input
                id="qa-model"
                placeholder="e.g. iPhone 12 Pro"
                value={quickAddDialog?.model || ''}
                onChange={e => setQuickAddDialog(s => s ? { ...s, model: e.target.value } : null)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Creates a smartphone entry. You can edit full specs in Admin → Device Catalog later.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAddDialog(null)}>Cancel</Button>
            <Button
              disabled={quickAddLoading || !quickAddDialog?.make?.trim() || !quickAddDialog?.model?.trim()}
              onClick={() => quickAddDialog && handleQuickAddDevice(quickAddDialog.make, quickAddDialog.model, quickAddDialog.index)}
            >
              {quickAddLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add &amp; Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
