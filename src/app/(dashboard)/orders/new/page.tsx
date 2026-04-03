// ============================================================================
// CREATE NEW ORDER PAGE - Unified Trade-In & CPO
// ============================================================================

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, X, Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, Files } from 'lucide-react'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { useOrders } from '@/hooks/useOrders'
import { useCustomers, useMyCustomer } from '@/hooks/useCustomers'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CONDITION_CONFIG, STORAGE_OPTIONS } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'
import type { Device, DeviceCondition } from '@/types'

// Column alias map — auto-corrects misspelled or alternative column names
const COLUMN_ALIASES: Record<string, string> = {
  device_make: 'device_make', make: 'device_make', brand: 'device_make', manufacturer: 'device_make',
  devcie_make: 'device_make', divice_make: 'device_make', 'device make': 'device_make', 'make*': 'device_make',
  device_model: 'device_model', model: 'device_model', device: 'device_model', product: 'device_model',
  devcie_model: 'device_model', divice_model: 'device_model', 'device model': 'device_model', 'model*': 'device_model',
  quantity: 'quantity', qty: 'quantity', quantitty: 'quantity', quantiy: 'quantity', quantit: 'quantity',
  condition: 'condition', condtion: 'condition', condiiton: 'condition',
  storage: 'storage', 'storage/gb': 'storage', 'storage/gb*': 'storage', capacity: 'storage',
  storag: 'storage', storrage: 'storage',
  notes: 'notes', faults: 'notes', 'faults/notes': 'notes', nots: 'notes',
  serial_number: 'serial_number', serial: 'serial_number', imei: 'serial_number',
  serial_numbr: 'serial_number', serail_number: 'serial_number', 'sample s/n': 'serial_number', 's/n': 'serial_number',
  color: 'color', colour: 'color', colur: 'color',
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
  if (['new', 'excellent', 'good', 'fair', 'poor'].includes(lower)) return lower
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
  storage: string
  notes: string
  order_type: 'trade_in' | 'cpo'
  serial_number: string // IMEI or serial for trade-in
  color: string // Device color
}

interface ItemPrice {
  unit_price: number
  cpo_unit_price: number
  loading: boolean
  error: string | null
  source: string
  competitor_count: number
}

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
  const { customers } = useCustomers()
  const { customer: myCustomer, isLoading: myCustomerLoading, error: myCustomerError } = useMyCustomer()
  const isCustomer = user?.role === 'customer'
  const isInternal = ['admin', 'coe_manager', 'coe_tech', 'sales'].includes(user?.role || '')
  const canCreateCpoOrder = ['admin', 'coe_manager', 'coe_tech', 'customer'].includes(user?.role || '')
  const cpoCreationBlockedMessage = 'Sales can create trade-in orders only. CPO orders must be created by admin, COE, or the customer portal.'

  const [devices, setDevices] = useState<Device[]>([])
  const [customerId, setCustomerId] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')
  const [tab, setTab] = useState('manual')
  
  // Multi-CSV state
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Pricing state (internal roles only)
  const [itemPrices, setItemPrices] = useState<Record<number, ItemPrice>>({})

  useEffect(() => {
    fetch('/api/devices?page_size=500').then(r => r.json()).then(d => setDevices(d.data || [])).catch(() => {})
  }, [])

  // For customer role: auto-set their org's customer (no selection needed)
  useEffect(() => {
    if (isCustomer && myCustomer?.id) setCustomerId(myCustomer.id)
  }, [isCustomer, myCustomer?.id])

  // Price lookup for internal staff
  const lookupPrice = useCallback(async (index: number, deviceId: string, storage: string, condition: DeviceCondition) => {
    if (!deviceId || !storage || !isInternal) return

    setItemPrices(prev => ({ ...prev, [index]: { unit_price: 0, cpo_unit_price: 0, loading: true, error: null, source: '', competitor_count: 0 } }))

    try {
      const res = await fetch('/api/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 'v2',
          device_id: deviceId,
          storage,
          carrier: 'Unlocked',
          condition,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success && (data.trade_price > 0 || data.cpo_price > 0)) {
          setItemPrices(prev => ({
            ...prev,
            [index]: {
              unit_price: data.trade_price || 0,
              cpo_unit_price: data.cpo_price || 0,
              loading: false,
              error: null,
              source: data.price_source || 'Pricing Engine V2',
              competitor_count: data.competitors?.length || 0,
            },
          }))
          return
        }
      }

      setItemPrices(prev => ({
        ...prev,
        [index]: { unit_price: 0, cpo_unit_price: 0, loading: false, error: 'No price data', source: '', competitor_count: 0 },
      }))
    } catch {
      setItemPrices(prev => ({
        ...prev,
        [index]: { unit_price: 0, cpo_unit_price: 0, loading: false, error: 'Lookup failed', source: '', competitor_count: 0 },
      }))
    }
  }, [isInternal])

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
      condition: 'good', 
      storage: '', 
      notes: '',
      order_type: orderType,
      serial_number: '',
      color: '',
    }])
  }

  const removeItem = (i: number) => {
    setItems(items.filter((_, idx) => idx !== i))
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
      // When switching to CPO, condition doesn't matter (all "Certified")
      if (field === 'order_type' && value === 'cpo') {
        return { ...item, order_type: 'cpo' as const, condition: 'good' as DeviceCondition }
      }
      return { ...item, [field]: value }
    })

    setItems(newItems)

    // Trigger price lookup when device, storage, condition, or order_type changes
    if (isInternal && ['device_id', 'storage', 'condition', 'order_type'].includes(field)) {
      const updatedItem = newItems[index]
      if (updatedItem) {
        setTimeout(() => {
          lookupPrice(index, updatedItem.device_id, updatedItem.storage, updatedItem.condition)
        }, 100)
      }
    }
  }

  const updateUnitPrice = (index: number, price: number) => {
    setItemPrices(prev => ({
      ...prev,
      [index]: {
        ...(prev[index] || { unit_price: 0, cpo_unit_price: 0, loading: false, error: null, source: 'manual', competitor_count: 0 }),
        unit_price: price,
      },
    }))
  }

  // CSV template downloads - separate for Trade-In and CPO (demo data for Apple & Samsung)
  const handleDownloadTradeInTemplate = () => {
    const headers = ['device_make', 'device_model', 'quantity', 'condition', 'storage', 'serial_number', 'color', 'notes']
    const sampleData = [
      ['Apple', 'iPhone 15', '5', 'excellent', '128GB', '359876543210001', 'Blue', 'Demo trade-in'],
      ['Apple', 'iPhone 15', '3', 'good', '256GB', '', 'Black', ''],
      ['Apple', 'iPhone 15 Pro', '2', 'fair', '256GB', '', 'Natural Titanium', 'Bulk buyback'],
      ['Samsung', 'Galaxy S24', '4', 'excellent', '128GB', '350123456789012', 'Onyx Black', ''],
      ['Samsung', 'Galaxy S24 Ultra', '2', 'good', '512GB', '', 'Titanium Gray', 'Demo Samsung'],
    ]
    const csvContent = [headers.join(','), ...sampleData.map(row => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'trade-in-template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('Trade-In template downloaded')
  }

  const handleDownloadCpoTemplate = () => {
    const headers = ['device_make', 'device_model', 'quantity', 'storage', 'notes']
    const sampleData = [
      ['Apple', 'iPhone 15', '150', '128GB', 'CPO bulk - corporate devices'],
      ['Apple', 'iPhone 15 Pro', '100', '256GB', ''],
      ['Samsung', 'Galaxy S24 Ultra', '50', '512GB', 'CPO bulk purchase'],
    ]
    const csvContent = [headers.join(','), ...sampleData.map(row => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'cpo-template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('CPO template downloaded')
  }

  // Multi-CSV handling — auto-corrects column names and condition values
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach(file => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const errors: string[] = []
          const rawHeaders = results.meta.fields || []
          const rawRows = results.data as Record<string, string>[]

          // Build header mapping: original → normalized canonical name
          const headerMap: Record<string, string> = {}
          const correctedHeaders: string[] = []
          for (const h of rawHeaders) {
            const canonical = normalizeHeader(h)
            headerMap[h] = canonical
            if (canonical !== h.toLowerCase().trim()) {
              correctedHeaders.push(`"${h}" → ${canonical}`)
            }
          }

          if (correctedHeaders.length > 0) {
            toast.info(`Auto-corrected columns: ${correctedHeaders.join(', ')}`, { duration: 5000 })
          }

          // Infer default order type from file name when column is missing
          const inferredOrderType: 'trade_in' | 'cpo' =
            file.name.toLowerCase().includes('cpo') ? 'cpo' : 'trade_in'

          // Normalize each row using header mapping
          const rows: CSVRow[] = rawRows.map(rawRow => {
            const mapped: Record<string, string> = {}
            for (const [origKey, value] of Object.entries(rawRow)) {
              const canonical = headerMap[origKey] || normalizeHeader(origKey)
              mapped[canonical] = (mapped[canonical] || '') || (value || '').trim()
            }

            // Handle "product" column (e.g. "iPhone 15 Pro") — split into make+model
            if (!mapped.device_make && mapped.device_model) {
              const model = mapped.device_model.toLowerCase()
              if (model.includes('iphone') || model.includes('ipad') || model.includes('macbook') || model.includes('apple watch')) {
                mapped.device_make = 'Apple'
              } else if (model.includes('galaxy') || model.includes('samsung')) {
                mapped.device_make = 'Samsung'
                mapped.device_model = mapped.device_model.replace(/samsung\s*/i, '')
              } else if (model.includes('pixel')) {
                mapped.device_make = 'Google'
              }
            }

            // Auto-correct condition value
            const rawCondition = mapped.condition || ''
            mapped.condition = normalizeCondition(rawCondition)

            // Ensure quantity defaults to 1
            if (!mapped.quantity || isNaN(Number(mapped.quantity))) {
              mapped.quantity = '1'
            }

            // Determine order type
            const rowType = mapped.order_type?.toLowerCase()
            const orderType = rowType === 'cpo' ? 'cpo' : inferredOrderType

            return {
              device_make: mapped.device_make || '',
              device_model: mapped.device_model || '',
              quantity: mapped.quantity || '1',
              condition: mapped.condition || 'good',
              storage: mapped.storage || '',
              notes: mapped.notes || '',
              order_type: orderType,
              serial_number: mapped.serial_number || '',
              color: mapped.color || '',
            }
          })

          if (!canCreateCpoOrder && rows.some((row) => row.order_type === 'cpo')) {
            toast.error(cpoCreationBlockedMessage)
            return
          }

          rows.forEach((row, i) => {
            if (!row.device_make) errors.push(`Row ${i + 1}: Missing make/brand`)
            if (!row.device_model) errors.push(`Row ${i + 1}: Missing model`)
          })

          setParsedFiles(prev => [...prev, {
            filename: file.name,
            rows,
            errors,
          }])

          if (errors.length === 0) {
            toast.success(`${file.name}: ${rows.length} rows parsed successfully`)
          } else {
            toast.warning(`${file.name}: ${rows.length} rows with ${errors.length} errors`)
          }
        },
        error: () => {
          toast.error(`Failed to parse ${file.name}`)
        },
      })
    })

    // Reset input
    if (fileRef.current) fileRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setParsedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // Edit a specific CSV row field (editable preview)
  const editCsvRow = (fileIndex: number, rowIndex: number, field: keyof CSVRow, value: string) => {
    setParsedFiles(prev => prev.map((f, fi) => {
      if (fi !== fileIndex) return f
      const newRows = [...f.rows]
      const nextValue = field === 'order_type' && !canCreateCpoOrder ? 'trade_in' : value
      newRows[rowIndex] = { ...newRows[rowIndex], [field]: nextValue }
      return { ...f, rows: newRows }
    }))
  }

  // Delete a specific CSV row
  const deleteCsvRow = (fileIndex: number, rowIndex: number) => {
    setParsedFiles(prev => prev.map((f, fi) => {
      if (fi !== fileIndex) return f
      return { ...f, rows: f.rows.filter((_, ri) => ri !== rowIndex) }
    }))
  }

  // Get all CSV rows combined (with file/row indices for editing)
  const allCsvRows = parsedFiles.flatMap((f, fi) => f.rows.map((row, ri) => ({ ...row, _fi: fi, _ri: ri })))
  const allCsvErrors = parsedFiles.flatMap(f => f.errors)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveCustomerId = isCustomer ? myCustomer?.id : customerId
    if (!effectiveCustomerId) {
      toast.error(isCustomer ? 'Loading your organization...' : 'Please select a customer')
      return
    }

    // Combine items from manual entry and CSV
    let orderItems: { device_id: string; quantity: number; storage: string; condition: DeviceCondition; notes: string; order_type: 'trade_in' | 'cpo'; serial_number?: string; color?: string; quoted_price?: number }[] = []

    if (tab === 'csv' && allCsvRows.length > 0) {
      // Use the upload-csv server API for full fuzzy matching (Levenshtein + aliases)
      // Split rows by order type and create separate orders
      const tradeInCsvRows = allCsvRows.filter(r => r.order_type !== 'cpo')
      const cpoCsvRows = allCsvRows.filter(r => r.order_type === 'cpo')

      if (!canCreateCpoOrder && cpoCsvRows.length > 0) {
        toast.error(cpoCreationBlockedMessage)
        return
      }

      try {
        const results: { id: string; type: string }[] = []

        for (const [orderType, csvRows] of [['trade_in', tradeInCsvRows], ['cpo', cpoCsvRows]] as const) {
          if (csvRows.length === 0) continue
          // Prepare rows as records with canonical column names for the server
          const columns = ['device_make', 'device_model', 'quantity', 'condition', 'storage', 'serial_number', 'color', 'notes']
          const apiRows = csvRows.map(row => ({
            device_make: row.device_make,
            device_model: row.device_model,
            quantity: row.quantity || '1',
            condition: row.condition || 'good',
            storage: row.storage || '',
            serial_number: row.serial_number || '',
            color: row.color || '',
            notes: row.notes || '',
          }))

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
            return
          }

          results.push({ id: data.order?.id, type: orderType === 'cpo' ? 'CPO' : 'Trade-In' })
        }

        if (results.length === 1) {
          toast.success(`${results[0].type} order created — ${allCsvRows.length} items`)
          router.push(`/orders/${results[0].id}`)
        } else if (results.length > 1) {
          toast.success(`Created ${results.length} orders: ${results.map(r => r.type).join(' & ')}`)
          router.push('/orders')
        }
        return
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to upload CSV')
        return
      }
    } else if (tab === 'csv') {
      toast.error('No CSV rows to submit')
      return
    } else {
      if (items.length === 0) { toast.error('Please add at least one item'); return }
      const invalidItems = items.filter(i => !i.device_id)
      if (invalidItems.length > 0) {
        toast.error('Please select a device for all items')
        return
      }
      orderItems = items.map((i, idx) => ({
        device_id: i.device_id,
        quantity: i.quantity,
        storage: i.storage || '128GB',
        condition: i.condition,
        notes: i.notes,
        order_type: i.order_type,
        serial_number: i.serial_number || '',
        color: i.color || '',
        ...(itemPrices[idx]?.unit_price > 0 ? { quoted_price: itemPrices[idx].unit_price } : {}),
      }))
    }

    // Group items by order type
    const tradeInItems = orderItems.filter(i => i.order_type === 'trade_in')
    const cpoItems = orderItems.filter(i => i.order_type === 'cpo')

    if (!canCreateCpoOrder && cpoItems.length > 0) {
      toast.error(cpoCreationBlockedMessage)
      return
    }

    try {
      const results: { id: string; type: string }[] = []

      // Create trade-in order if there are trade-in items
      if (tradeInItems.length > 0) {
        const result = await create({
          type: 'trade_in',
          customer_id: effectiveCustomerId,
          items: tradeInItems.map(({ order_type, ...rest }) => rest),
          notes: notes ? `${notes} (Trade-In)` : undefined,
        } as Record<string, unknown>)
        results.push({ id: result.id, type: 'Trade-In' })
      }

      // Create CPO order if there are CPO items
      if (cpoItems.length > 0) {
        const result = await create({
          type: 'cpo',
          customer_id: effectiveCustomerId,
          items: cpoItems.map(({ order_type, ...rest }) => rest),
          notes: notes ? `${notes} (CPO)` : undefined,
        } as Record<string, unknown>)
        results.push({ id: result.id, type: 'CPO' })
      }

      if (results.length === 1) {
        toast.success(`${results[0].type} order created successfully`)
        router.push(`/orders/${results[0].id}`)
      } else if (results.length === 2) {
        toast.success(`Created ${results.length} orders: ${results.map(r => r.type).join(' & ')}`)
        router.push('/orders')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order')
    }
  }

  // Calculate quote totals by type
  const tradeInItems = items.filter(i => i.order_type === 'trade_in')
  const cpoItemsList = items.filter(i => i.order_type === 'cpo')
  const tradeInTotal = tradeInItems.reduce((sum, item, i) => {
    const idx = items.indexOf(item)
    return sum + ((itemPrices[idx]?.unit_price || 0) * item.quantity)
  }, 0)
  const cpoTotal = cpoItemsList.reduce((sum, item) => {
    const idx = items.indexOf(item)
    return sum + ((itemPrices[idx]?.cpo_unit_price || 0) * item.quantity)
  }, 0)

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
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                <TabsTrigger value="csv">CSV Upload</TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-3 rounded-lg bg-muted/50">
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
                  <p className="text-center py-6 text-muted-foreground">No items added yet. Click buttons above to add items.</p>
                ) : (
                  items.map((item, index) => {
                    const selectedDevice = devices.find(d => d.id === item.device_id)
                    const storageOptions = getStorageOptionsForDevice(selectedDevice)
                    const price = itemPrices[index]

                    return (
                      <div key={index}>
                        {index > 0 && <Separator className="mb-3" />}
                        <div className="flex items-start gap-3">
                          <div className="flex-1 space-y-2">
                            {/* Row 1: Type, Device, Qty, Condition/Certified, Storage */}
                            <div className={`grid gap-2 ${isInternal ? 'sm:grid-cols-6' : 'sm:grid-cols-5'}`}>
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
                              <Select value={item.device_id} onValueChange={v => updateItem(index, 'device_id', v)}>
                                <SelectTrigger><SelectValue placeholder="Device" /></SelectTrigger>
                                <SelectContent>
                                  {devices.map(d => <SelectItem key={d.id} value={d.id}>{d.make} {d.model}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} placeholder="Qty" />
                              {/* Condition dropdown only for Trade-In; CPO items are always "Certified" */}
                              {item.order_type === 'cpo' ? (
                                <div className="flex items-center h-10 px-3 rounded-md border bg-blue-50 border-blue-200">
                                  <Badge className="bg-blue-600">Certified</Badge>
                                </div>
                              ) : (
                                <Select value={item.condition} onValueChange={v => updateItem(index, 'condition', v)}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(CONDITION_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
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
                                  ) : price?.unit_price > 0 || price?.cpo_unit_price > 0 ? (
                                    <div className="space-y-0.5">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="text-right font-mono"
                                        value={item.order_type === 'cpo' ? (price.cpo_unit_price || 0) : price.unit_price}
                                        onChange={e => updateUnitPrice(index, parseFloat(e.target.value) || 0)}
                                      />
                                      <span className="text-[10px] text-muted-foreground">{price.source}</span>
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
              </TabsContent>

              <TabsContent value="csv" className="space-y-4">
                {/* Clear template labels at top */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <p className="font-semibold text-sm">
                    {canCreateCpoOrder ? 'Choose the correct template for your order type:' : 'Use the trade-in template for customer intake:'}
                  </p>
                  <div className={`grid gap-4 text-left ${canCreateCpoOrder ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
                    <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 p-3">
                      <p className="font-medium text-green-800 dark:text-green-300 text-sm">Trade-In Template</p>
                      <p className="text-xs text-muted-foreground mt-0.5">For device buybacks. Columns: device_make, device_model, quantity, condition, storage, serial_number, color, notes</p>
                    </div>
                    {canCreateCpoOrder && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3">
                        <p className="font-medium text-blue-800 dark:text-blue-300 text-sm">CPO Template</p>
                        <p className="text-xs text-muted-foreground mt-0.5">For Certified Pre-Owned purchases. Columns: device_make, device_model, quantity, storage, notes</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {canCreateCpoOrder
                      ? 'You can also use your own CSV file if it has the same columns (or equivalent: make/model, storage, etc.).'
                      : 'You can also use your own CSV file if it matches the trade-in columns (or equivalent: make/model, storage, etc.).'}
                  </p>
                </div>

                <div className="rounded-lg border-2 border-dashed p-6 text-center">
                  <Files className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    {canCreateCpoOrder ? 'Download the template you need, or upload your own CSV' : 'Download the trade-in template, or upload your own trade-in CSV'}
                  </p>
                  <input ref={fileRef} type="file" accept=".csv" multiple onChange={handleFileUpload} className="hidden" />
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button type="button" variant="outline" onClick={handleDownloadTradeInTemplate} className="border-green-600 text-green-700 hover:bg-green-50">
                      <Download className="mr-2 h-4 w-4" />Download Trade-In Template
                    </Button>
                    {canCreateCpoOrder && (
                      <Button type="button" variant="outline" onClick={handleDownloadCpoTemplate} className="border-blue-600 text-blue-700 hover:bg-blue-50">
                        <Download className="mr-2 h-4 w-4" />Download CPO Template
                      </Button>
                    )}
                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />Upload Your Own CSV
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
                              {file.errors.length > 0 && <span className="text-destructive"> • {file.errors.length} errors</span>}
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

                {allCsvErrors.length > 0 && (
                  <div className="rounded-md bg-destructive/10 p-3 space-y-1">
                    <p className="text-sm font-medium text-destructive">Validation Errors:</p>
                    {allCsvErrors.slice(0, 5).map((err, i) => <p key={i} className="text-xs text-destructive">{err}</p>)}
                    {allCsvErrors.length > 5 && <p className="text-xs text-destructive">...and {allCsvErrors.length - 5} more</p>}
                  </div>
                )}

                {allCsvRows.length > 0 && (
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
                          {allCsvRows.slice(0, 50).map((row, i) => (
                            <TableRow key={i}>
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
                                    {Object.entries(CONDITION_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
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
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {allCsvRows.length > 50 && <p className="text-xs text-muted-foreground mt-2">Showing 50 of {allCsvRows.length} rows. All rows will be submitted.</p>}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Quote Summary (internal staff only, manual entry) */}
        {isInternal && tab === 'manual' && items.length > 0 && (tradeInTotal > 0 || cpoTotal > 0) && (
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
                    <TableHead>Condition</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Unit Price</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => {
                    const price = itemPrices[i]
                    const unitPrice = item.order_type === 'cpo' ? (price?.cpo_unit_price || 0) : (price?.unit_price || 0)
                    if (unitPrice <= 0) return null
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant={item.order_type === 'cpo' ? 'default' : 'secondary'}>
                            {item.order_type === 'cpo' ? 'CPO' : 'Trade-In'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{item.device_label || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{item.condition}</Badge>
                        </TableCell>
                        <TableCell>{item.storage}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono whitespace-nowrap">{formatCurrency(unitPrice)}</TableCell>
                        <TableCell className="text-right font-mono font-medium whitespace-nowrap">{formatCurrency(unitPrice * item.quantity)}</TableCell>
                      </TableRow>
                    )
                  })}
                  {tradeInTotal > 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-right font-semibold">Trade-In Total</TableCell>
                      <TableCell className="text-right font-mono font-bold text-green-600">{formatCurrency(tradeInTotal)}</TableCell>
                    </TableRow>
                  )}
                  {cpoTotal > 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-right font-semibold">CPO Total</TableCell>
                      <TableCell className="text-right font-mono font-bold text-blue-600">{formatCurrency(cpoTotal)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
            disabled={isCreating || (isCustomer && (myCustomerLoading || !myCustomer || !!myCustomerError))}
          >
            {isCreating ? 'Creating...' : 'Create Order'}
          </Button>
          <Link href={isCustomer ? '/customer/requests' : '/orders'}>
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
