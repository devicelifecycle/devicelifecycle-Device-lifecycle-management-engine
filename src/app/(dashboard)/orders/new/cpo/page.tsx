// ============================================================================
// CREATE CPO ORDER PAGE
// ============================================================================

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, X, Upload, FileSpreadsheet, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useOrders } from '@/hooks/useOrders'
import { useCustomers } from '@/hooks/useCustomers'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { CsvUploadGuide } from '@/components/orders/CsvUploadGuide'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { STORAGE_OPTIONS } from '@/lib/constants'
import { matchDeviceFromCsv } from '@/lib/device-match'
import { formatCurrency } from '@/lib/utils'
import {
  CPO_CSV_HEADERS,
  CPO_CSV_SAMPLE,
  buildXlsxTemplateBlob,
} from '@/lib/csv-templates'
import type { Device, DeviceCondition } from '@/types'

interface CSVRow {
  device_make: string
  device_model: string
  quantity: string
  storage: string
  notes: string
  device_id?: string | null
}

// CPO condition options — user-facing labels mapped to DeviceCondition
const CPO_CONDITIONS = [
  { label: 'Brand New', value: 'new' as DeviceCondition, description: 'Factory sealed, never activated' },
  { label: 'New',       value: 'excellent' as DeviceCondition, description: 'New or open-box, like new' },
  { label: 'CPO A',     value: 'good' as DeviceCondition, description: 'Certified pre-owned, grade A' },
] as const

type CpoConditionValue = typeof CPO_CONDITIONS[number]['value']

interface CpoCompetitorPrice {
  name: string
  sell_price: number
}

interface ConditionPriceEntry {
  price: number
  loading: boolean
  error: string | null
  source: string
  competitors: CpoCompetitorPrice[]
}

interface ItemPrice {
  manual_price: string  // user override applied to the primary condition
  conditionPrices: Partial<Record<CpoConditionValue, ConditionPriceEntry>>
}

interface LineItem {
  device_id: string
  device_label: string
  quantity: number
  storage: string
  notes: string
  selectedConditions: DeviceCondition[]
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

export default function NewCPOOrderPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { create, isCreating } = useOrders()
  const { customers } = useCustomers()
  const isCustomer = user?.role === 'customer'
  const isInternal = ['admin', 'coe_manager', 'coe_tech', 'sales'].includes(user?.role || '')
  const [devices, setDevices] = useState<Device[]>([])
  const [customerId, setCustomerId] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')
  const [tab, setTab] = useState<'manual' | 'csv'>('manual')
  const [csvData, setCsvData] = useState<CSVRow[]>([])
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const latestLookupRequestRef = useRef<Record<number, number>>({})
  const nextLookupRequestIdRef = useRef(1)
  const submittedRef = useRef(false)

  // Pricing state (internal roles only)
  const [itemPrices, setItemPrices] = useState<Record<number, ItemPrice>>({})
  const [beatMode, setBeatMode] = useState<'amount' | 'percent'>('amount')
  const [beatOverride, setBeatOverride] = useState<string>('')

  // Device search state — one entry per line item
  const [deviceSearches, setDeviceSearches] = useState<Record<number, string>>({})
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState<Record<number, boolean>>({})
  const [dropdownRects, setDropdownRects] = useState<Record<number, DOMRect>>({})
  const [deviceSearchResults, setDeviceSearchResults] = useState<Record<number, Device[]>>({})
  const deviceInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const deviceSearchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  // Quick-add to catalog state (admin/coe_manager only)
  const [quickAddDialog, setQuickAddDialog] = useState<{ index: number; make: string; model: string } | null>(null)
  const [quickAddLoading, setQuickAddLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      const all: Device[] = []
      let page = 1
      for (;;) {
        const res = await fetch(`/api/devices?page_size=500&for_order_creation=1&sort_by=make&sort_order=asc&page=${page}`)
        if (!res.ok || cancelled) break
        const d = await res.json()
        const rows: Device[] = d.data || []
        all.push(...rows)
        if (rows.length < 500) break
        page++
      }
      if (!cancelled) setDevices(all)
    }
    loadAll().catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (isCustomer) {
      router.replace('/orders/new')
    }
  }, [isCustomer, router])

  const lookupPrice = useCallback(async (
    index: number,
    deviceId: string,
    storage: string,
    conditions: DeviceCondition[],
    beatModeArg?: 'amount' | 'percent',
    beatValArg?: string,
  ) => {
    if (!isInternal) return
    if (!deviceId || !storage || conditions.length === 0) {
      delete latestLookupRequestRef.current[index]
      setItemPrices(prev => ({
        ...prev,
        [index]: { manual_price: prev[index]?.manual_price ?? '', conditionPrices: {} },
      }))
      return
    }

    const requestId = nextLookupRequestIdRef.current++
    latestLookupRequestRef.current[index] = requestId

    const effectiveBeatMode = beatModeArg ?? beatMode
    const effectiveBeatVal = beatValArg ?? beatOverride
    const beatNum = effectiveBeatVal !== '' ? parseFloat(effectiveBeatVal) : null
    const beatBody: Record<string, number> = {}
    if (beatNum !== null && !Number.isNaN(beatNum) && beatNum >= 0) {
      if (effectiveBeatMode === 'percent') beatBody.beat_competitor_percent = beatNum
      else beatBody.beat_competitor_amount = beatNum
    }

    // Mark all selected conditions as loading
    setItemPrices(prev => {
      const existing = prev[index] ?? { manual_price: '', conditionPrices: {} }
      const conditionPrices = { ...existing.conditionPrices }
      for (const cond of conditions) {
        conditionPrices[cond as CpoConditionValue] = { price: 0, loading: true, error: null, source: '', competitors: [] }
      }
      return { ...prev, [index]: { ...existing, conditionPrices } }
    })

    // Fetch price for each selected condition in parallel
    await Promise.all(conditions.map(async (condition) => {
      try {
        const res = await fetch('/api/pricing/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: 'v2', device_id: deviceId, storage, carrier: 'Unlocked', condition, ...beatBody }),
        })
        if (latestLookupRequestRef.current[index] !== requestId) return

        if (res.ok) {
          const data = await res.json()
          if (data.success && data.cpo_price > 0) {
            setItemPrices(prev => {
              const existing = prev[index] ?? { manual_price: '', conditionPrices: {} }
              return {
                ...prev,
                [index]: {
                  ...existing,
                  conditionPrices: {
                    ...existing.conditionPrices,
                    [condition]: {
                      price: data.cpo_price,
                      loading: false,
                      error: null,
                      source: data.price_source || 'Engine V2',
                      competitors: (data.cpo_competitors || []) as CpoCompetitorPrice[],
                    },
                  },
                },
              }
            })
            return
          }
        }

        setItemPrices(prev => {
          const existing = prev[index] ?? { manual_price: '', conditionPrices: {} }
          return {
            ...prev,
            [index]: {
              ...existing,
              conditionPrices: {
                ...existing.conditionPrices,
                [condition]: { price: 0, loading: false, error: 'No price data', source: '', competitors: [] },
              },
            },
          }
        })
      } catch {
        if (latestLookupRequestRef.current[index] !== requestId) return
        setItemPrices(prev => {
          const existing = prev[index] ?? { manual_price: '', conditionPrices: {} }
          return {
            ...prev,
            [index]: {
              ...existing,
              conditionPrices: {
                ...existing.conditionPrices,
                [condition]: { price: 0, loading: false, error: 'Lookup failed', source: '', competitors: [] },
              },
            },
          }
        })
      }
    }))
  }, [isInternal, beatMode, beatOverride])

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

  const addItem = () => {
    setItems([...items, { device_id: '', device_label: '', quantity: 1, storage: '', notes: '', selectedConditions: ['good'] }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
    latestLookupRequestRef.current = {}
    setDeviceSearches(prev => {
      const next = { ...prev }
      delete next[index]
      const reindexed: Record<number, string> = {}
      Object.keys(next).forEach(key => {
        const k = parseInt(key)
        reindexed[k > index ? k - 1 : k] = next[k]
      })
      return reindexed
    })
    setItemPrices(prev => {
      const next = { ...prev }
      delete next[index]
      const reindexed: Record<number, ItemPrice> = {}
      Object.keys(next).forEach(key => {
        const k = parseInt(key)
        reindexed[k > index ? k - 1 : k] = next[k]
      })
      return reindexed
    })
  }

  const updateItem = (index: number, field: string, value: string | number | DeviceCondition[]) => {
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
      return { ...item, [field]: value }
    })
    setItems(newItems)

    if (isInternal && ['device_id', 'storage', 'selectedConditions'].includes(field)) {
      const updated = newItems[index]
      if (updated) lookupPrice(index, updated.device_id, updated.storage, updated.selectedConditions)
    }
  }

  const toggleCondition = (index: number, condition: DeviceCondition) => {
    const item = items[index]
    const current = item.selectedConditions
    const next = current.includes(condition)
      ? current.filter(c => c !== condition)
      : [...current, condition]
    // Always keep at least one condition selected
    if (next.length === 0) return
    updateItem(index, 'selectedConditions', next)
  }

  const updateManualPrice = (index: number, val: string) => {
    setItemPrices(prev => ({
      ...prev,
      [index]: {
        ...(prev[index] || { manual_price: '', conditionPrices: {} }),
        manual_price: val,
      },
    }))
  }

  const getPrimaryCondition = (item: LineItem): DeviceCondition =>
    item.selectedConditions[0] ?? 'good'

  const getFinalPrice = (i: number) => {
    const p = itemPrices[i]
    if (!p) return 0
    if (p.manual_price !== '' && !Number.isNaN(parseFloat(p.manual_price))) return parseFloat(p.manual_price)
    const primaryCond = getPrimaryCondition(items[i]) as CpoConditionValue
    return p.conditionPrices[primaryCond]?.price ?? 0
  }

  if (isCustomer) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">Opening the customer order form...</p>
      </div>
    )
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

  const handleDownloadCpoExcelTemplate = async () => {
    const blob = await buildXlsxTemplateBlob('CPO Template', CPO_CSV_HEADERS, CPO_CSV_SAMPLE)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'cpo-template.xlsx'
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('CPO Excel template downloaded')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileRef.current) fileRef.current.value = ''

    try {
      setCsvErrors([])
      setCsvData([])
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/orders/parse-trade-template', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to parse file')

      type ApiRow = { make: string; model: string; storage: string; condition: string; quantity: number; serials: string[]; device_id?: string | null }
      const rows: CSVRow[] = (data.rows as ApiRow[] || []).map(r => ({
        device_make: r.make || '',
        device_model: r.model || '',
        quantity: String(r.quantity || 1),
        storage: r.storage || '',
        notes: r.serials?.length ? `Serials: ${r.serials.slice(0, 5).join(', ')}${r.serials.length > 5 ? '…' : ''}` : '',
        device_id: r.device_id || null,
      }))

      const errors: string[] = []
      rows.forEach((row, i) => {
        if (!row.device_make && !row.device_model) errors.push(`Row ${i + 1}: No device identified`)
        if (!row.quantity || isNaN(Number(row.quantity)) || Number(row.quantity) < 1) errors.push(`Row ${i + 1}: Quantity is required for CPO orders`)
      })

      setCsvErrors(errors)
      setCsvData(rows)
      const total = data.summary?.total_devices ?? rows.length
      toast.success(`${total} device${total !== 1 ? 's' : ''} parsed — ${data.summary?.matched ?? 0} matched to catalog`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse file. Use CSV or Excel (.xlsx/.xls).')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submittedRef.current) return
    if (!customerId) { toast.error('Please select a customer'); return }

    let orderItems: { device_id: string; quantity: number; storage: string; condition: DeviceCondition; notes: string }[]
    if (tab === 'csv' && csvData.length > 0) {
      const rows = csvData.map(row => {
        const deviceId = row.device_id || matchDeviceFromCsv(devices, row.device_make, row.device_model)?.id || ''
        return {
          device_id: deviceId,
          quantity: parseInt(row.quantity) || 1,
          storage: row.storage || '128GB',
          condition: 'good' as DeviceCondition,
          notes: row.notes || '',
          _row: row,
        }
      })
      const invalid = rows.filter(r => !r.device_id)
      if (invalid.length > 0) {
        const examples = invalid.slice(0, 3).map(r => `"${(r as { _row?: CSVRow })._row?.device_make || '?'} ${(r as { _row?: CSVRow })._row?.device_model || '?'}"`).join(', ')
        toast.error(`Could not match ${invalid.length} row(s): ${examples}. Use exact make/model from catalog (e.g. Apple, iPhone 15 Pro).`)
        return
      }
      if (csvErrors.length > 0) {
        toast.error('Please fix CSV errors before submitting')
        return
      }
      orderItems = rows.map(({ _row, ...r }) => r)
    } else {
      if (items.length === 0) { toast.error('Please add at least one item'); return }
      if (items.some(i => !i.device_id)) { toast.error('Please select a device for all items'); return }
      // Expand each item into one order item per selected condition
      orderItems = items.flatMap(i => {
        const conditions = i.selectedConditions.length > 0 ? i.selectedConditions : ['good' as DeviceCondition]
        const isMulti = conditions.length > 1
        return conditions.map(condition => {
          const condLabel = CPO_CONDITIONS.find(c => c.value === condition)?.label ?? condition
          return {
            device_id: i.device_id,
            quantity: i.quantity,
            storage: i.storage || '128GB',
            condition,
            notes: isMulti ? `Comparison: ${condLabel}${i.notes ? ` — ${i.notes}` : ''}` : i.notes,
          }
        })
      })
    }

    submittedRef.current = true
    try {
      const result = await create({
        type: 'cpo',
        customer_id: customerId,
        items: orderItems,
        notes,
      } as any)
      toast.success('CPO order created successfully')
      router.replace(`/orders/${result.id}`)
    } catch (err) {
      submittedRef.current = false
      toast.error(err instanceof Error ? err.message : 'Failed to create order')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/orders"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">New CPO Order</h1>
          <p className="text-muted-foreground">Create a Certified Pre-Owned purchase order</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer Selection */}
        <Card>
          <CardHeader><CardTitle>Customer</CardTitle><CardDescription>Who is this order for?</CardDescription></CardHeader>
          <CardContent>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
              <SelectContent>
                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle>Devices</CardTitle><CardDescription>Add devices manually or upload a CPO CSV</CardDescription></div>
            <Button type="button" variant="outline" size="sm" onClick={addItem} className={tab === 'manual' ? '' : 'hidden'}><Plus className="mr-2 h-3 w-3" />Add Item</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={tab} onValueChange={v => setTab(v as 'manual' | 'csv')} className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                <TabsTrigger value="csv">CSV Upload</TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="space-y-4">
            {items.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">No items added. Click &quot;Add Item&quot; to start.</p>
            ) : (
              items.map((item, index) => {
                const selectedDevice = devices.find(d => d.id === item.device_id)
                const storageOptions = getStorageOptionsForDevice(selectedDevice)
                const price = itemPrices[index]
                return (
                  <div key={index}>
                    {index > 0 && <Separator className="mb-4" />}
                    <div className="flex items-start gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Device</Label>
                            <div className="relative">
                              <Input
                                ref={el => { deviceInputRefs.current[index] = el }}
                                placeholder="Search device..."
                                value={deviceSearches[index] !== undefined ? deviceSearches[index] : item.device_label}
                                onChange={e => {
                                  setDeviceSearches(prev => ({ ...prev, [index]: e.target.value }))
                                  searchDevices(index, e.target.value)
                                  const rect = deviceInputRefs.current[index]?.getBoundingClientRect()
                                  if (rect) setDropdownRects(prev => ({ ...prev, [index]: rect }))
                                  setDeviceDropdownOpen(prev => ({ ...prev, [index]: true }))
                                }}
                                onFocus={() => {
                                  const rect = deviceInputRefs.current[index]?.getBoundingClientRect()
                                  if (rect) setDropdownRects(prev => ({ ...prev, [index]: rect }))
                                  setDeviceDropdownOpen(prev => ({ ...prev, [index]: true }))
                                }}
                                onBlur={() => setTimeout(() => setDeviceDropdownOpen(prev => ({ ...prev, [index]: false })), 150)}
                                autoComplete="off"
                              />
                              {deviceDropdownOpen[index] && dropdownRects[index] && createPortal(
                                <div
                                  style={{
                                    position: 'fixed',
                                    top: dropdownRects[index].bottom + 4,
                                    left: dropdownRects[index].left,
                                    width: dropdownRects[index].width,
                                    zIndex: 9999,
                                  }}
                                  className="max-h-56 overflow-y-auto rounded-md border bg-popover shadow-lg"
                                >
                                  {(() => {
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
                                    if (filtered.length === 0) {
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
                                    }
                                    return filtered.map(d => (
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
                                  })()}
                                </div>,
                                document.body
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Qty</Label>
                            <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} />
                          </div>
                        </div>
                        {/* Condition multi-select */}
                        <div className="space-y-1.5">
                          <Label className="text-xs">Condition <span className="text-muted-foreground font-normal">(select one or more for comparison)</span></Label>
                          <div className="flex flex-wrap gap-1.5">
                            {CPO_CONDITIONS.map(opt => {
                              const selected = item.selectedConditions.includes(opt.value)
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  title={opt.description}
                                  onClick={() => toggleCondition(index, opt.value)}
                                  className={[
                                    'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                                    selected
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-muted/40 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground',
                                  ].join(' ')}
                                >
                                  {opt.label}
                                </button>
                              )
                            })}
                          </div>
                          {item.selectedConditions.length > 1 && (
                            <p className="text-[11px] text-blue-600 dark:text-blue-400">
                              Will create {item.selectedConditions.length} comparison items on submit
                            </p>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Storage</Label>
                            <Select value={item.storage} onValueChange={v => updateItem(index, 'storage', v)}>
                              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                {storageOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Notes</Label>
                            <Input placeholder="Optional notes" value={item.notes} onChange={e => updateItem(index, 'notes', e.target.value)} />
                          </div>
                        </div>
                        {/* Inline price indicator for internal staff */}
                        {isInternal && price && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            {item.selectedConditions.map(cond => {
                              const cp = price.conditionPrices[cond as CpoConditionValue]
                              const condLabel = CPO_CONDITIONS.find(c => c.value === cond)?.label ?? cond
                              if (!cp) return null
                              return (
                                <span key={cond} className="flex items-center gap-1">
                                  <span className="text-muted-foreground">{condLabel}:</span>
                                  {cp.loading
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : cp.price > 0
                                      ? <span className="font-medium text-foreground">{formatCurrency(cp.price)}/unit</span>
                                      : <span className="text-muted-foreground">no data</span>
                                  }
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="mt-5 shrink-0" onClick={() => removeItem(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
              </TabsContent>

              <TabsContent value="csv" className="space-y-4">
                <CsvUploadGuide defaultOpen={isCustomer} />

                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-4">
                  <p className="font-semibold text-blue-800 dark:text-blue-300 text-sm">CPO Template</p>
                  <p className="text-xs text-muted-foreground mt-1">Use this template for Certified Pre-Owned bulk purchases. Columns: Make, Model, quantity, storage, notes. Download template to ensure correct format.</p>
                </div>
                <div className="rounded-lg border-2 border-dashed p-6 text-center">
                  <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Download the CPO template or upload your own CSV or Excel file</p>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button type="button" variant="outline" onClick={handleDownloadCpoTemplate} className="border-blue-600 text-blue-700 hover:bg-blue-50">
                      <Download className="mr-2 h-4 w-4" />Download CPO Template
                    </Button>
                    <Button type="button" variant="outline" onClick={handleDownloadCpoExcelTemplate} className="border-blue-600 text-blue-700 hover:bg-blue-50">
                      <FileSpreadsheet className="mr-2 h-4 w-4" />Download Excel Template
                    </Button>
                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />Upload CSV or Excel
                    </Button>
                  </div>
                </div>
                {csvErrors.length > 0 && (
                  <div className="rounded-md bg-destructive/10 p-3 space-y-1">
                    <p className="text-sm font-medium text-destructive">Validation Errors:</p>
                    {csvErrors.slice(0, 5).map((err, i) => <p key={i} className="text-xs text-destructive">{err}</p>)}
                  </div>
                )}
                {csvData.length > 0 && csvErrors.length === 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Preview ({csvData.length} rows)</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Make</TableHead>
                          <TableHead>Model</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Storage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvData.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{row.device_make}</TableCell>
                            <TableCell>{row.device_model}</TableCell>
                            <TableCell>{row.quantity}</TableCell>
                            <TableCell>{row.storage || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {csvData.length > 10 && <p className="text-xs text-muted-foreground mt-2">Showing 10 of {csvData.length} rows</p>}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Quote Summary — internal staff only, manual tab */}
        {isInternal && tab === 'manual' && items.some((_, i) => {
          const cp = itemPrices[i]?.conditionPrices
          return cp && Object.values(cp).some(e => (e?.price ?? 0) > 0)
        }) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quote Summary</CardTitle>
              <CardDescription>CPO sell pricing by condition. Competitor sell prices shown for internal reference only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Beat by control */}
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">Beat Competitors By</p>
                  <p className="text-xs text-muted-foreground">
                    How much above the avg competitor sell price to list CPO. Default is the saved setting.
                    {beatOverride !== '' && !Number.isNaN(parseFloat(beatOverride)) && (
                      <span className="ml-1 font-medium text-foreground">
                        Quoting avg + {beatMode === 'percent' ? parseFloat(beatOverride) + '%' : '$' + parseFloat(beatOverride)}.
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                    value={beatMode}
                    onChange={e => setBeatMode(e.target.value as 'amount' | 'percent')}
                  >
                    <option value="amount">$ flat</option>
                    <option value="percent">%</option>
                  </select>
                  <div className="relative w-24">
                    <Input
                      type="number"
                      min="0"
                      step={beatMode === 'percent' ? '0.5' : '1'}
                      placeholder={beatMode === 'percent' ? 'e.g. 5' : 'e.g. 10'}
                      value={beatOverride}
                      onChange={e => setBeatOverride(e.target.value)}
                      className="pr-7 text-right h-8"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {beatMode === 'percent' ? '%' : '$'}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={beatOverride === '' || Number.isNaN(parseFloat(beatOverride))}
                    onClick={() => {
                      items.forEach((item, i) => {
                        if (item.device_id && item.storage) {
                          lookupPrice(i, item.device_id, item.storage, item.selectedConditions, beatMode, beatOverride)
                        }
                      })
                    }}
                  >
                    Apply
                  </Button>
                  {beatOverride !== '' && (
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => {
                      setBeatOverride('')
                      items.forEach((item, i) => {
                        if (item.device_id && item.storage) lookupPrice(i, item.device_id, item.storage, item.selectedConditions, beatMode, '')
                      })
                    }}>
                      Reset
                    </Button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right text-muted-foreground">Engine CPO</TableHead>
                      <TableHead className="text-right text-amber-700 bg-amber-50/60">Competitors (Sell)</TableHead>
                      <TableHead className="text-right font-semibold">Our CPO Quote</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.flatMap((item, i) => {
                      const priceEntry = itemPrices[i]
                      if (!priceEntry) return []
                      const isManual = priceEntry.manual_price !== '' && !Number.isNaN(parseFloat(priceEntry.manual_price))
                      const primaryCond = getPrimaryCondition(item) as CpoConditionValue
                      const finalUnit = getFinalPrice(i)

                      return item.selectedConditions.map(cond => {
                        const cp = priceEntry.conditionPrices[cond as CpoConditionValue]
                        if (!cp || cp.price <= 0) return null
                        const condLabel = CPO_CONDITIONS.find(c => c.value === cond)?.label ?? cond
                        const isPrimary = cond === primaryCond
                        return (
                          <TableRow key={`${i}-${cond}`}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {item.device_label || '—'}
                            </TableCell>
                            <TableCell>
                              <span className={[
                                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                                cond === 'new' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' :
                                cond === 'excellent' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' :
                                'bg-muted text-muted-foreground',
                              ].join(' ')}>{condLabel}</span>
                            </TableCell>
                            <TableCell className="text-xs">{item.storage}</TableCell>
                            <TableCell className="text-right text-xs">{item.quantity}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatCurrency(cp.price)}</TableCell>
                            {/* Competitor sell prices — internal only */}
                            <TableCell className="bg-amber-50/40 min-w-[160px]">
                              {cp.competitors.length > 0 ? (
                                <div className="space-y-0.5">
                                  {cp.competitors.map(c => (
                                    <div key={c.name} className="flex items-center justify-between gap-2 text-[11px]">
                                      <span className="text-muted-foreground truncate max-w-[90px]">{c.name}</span>
                                      <span className="font-mono font-medium text-amber-800">{formatCurrency(c.sell_price)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">No data</span>
                              )}
                            </TableCell>
                            {/* Editable final CPO quote price (only for primary condition) */}
                            <TableCell className="text-right">
                              {isPrimary ? (
                                <>
                                  <div className="relative w-28 ml-auto">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      placeholder={String(cp.price)}
                                      value={priceEntry.manual_price}
                                      onChange={e => updateManualPrice(i, e.target.value)}
                                      className="text-right font-mono font-semibold h-8 pr-1"
                                    />
                                  </div>
                                  {isManual && (
                                    <div className="text-[10px] text-blue-600 text-right mt-0.5">manual · engine: {formatCurrency(cp.price)}</div>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground font-mono">{formatCurrency(cp.price)}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {isPrimary ? formatCurrency(finalUnit * item.quantity) : formatCurrency(cp.price * item.quantity)}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    })}
                    <TableRow className="border-t-2">
                      <TableCell colSpan={7} className="text-right font-semibold">Grand Total (primary conditions)</TableCell>
                      <TableCell className="text-right font-mono font-bold text-lg">
                        {formatCurrency(items.reduce((sum, item, i) => sum + getFinalPrice(i) * item.quantity, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Competitor sell prices are for internal reference only — not visible to the customer. Edit <span className="font-medium">Our CPO Quote</span> to override the engine price for the primary condition.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <Textarea placeholder="Any additional notes for this order..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex gap-2">
          <Button type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create CPO Order'}</Button>
          <Link href="/orders"><Button variant="outline" type="button">Cancel</Button></Link>
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
              Creates a smartphone entry. Full specs can be edited in Admin → Device Catalog later.
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
