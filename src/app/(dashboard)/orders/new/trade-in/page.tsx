// ============================================================================
// CREATE TRADE-IN ORDER PAGE
// ============================================================================

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, X, Upload, FileSpreadsheet, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useOrders } from '@/hooks/useOrders'
import { useCustomers } from '@/hooks/useCustomers'
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
import { matchDeviceFromCsv } from '@/lib/device-match'
import {
  TRADE_IN_CSV_HEADERS,
  TRADE_IN_CSV_SAMPLE,
  buildCsvContent,
  buildXlsxTemplateBlob,
} from '@/lib/csv-templates'
import { formatCurrency } from '@/lib/utils'
import type { Device, DeviceCondition } from '@/types'

interface CSVRow {
  device_make: string
  device_model: string
  quantity: string
  condition: string
  storage: string
  notes: string
}

interface LineItem {
  device_id: string
  device_label: string
  quantity: number
  condition: DeviceCondition
  storage: string
  notes: string
}

interface CompetitorPrice {
  name: string
  price: number
}

interface ItemPrice {
  engine_price: number      // raw price from engine
  manual_price: string      // user-typed override (empty = use engine+margin)
  cpo_unit_price: number
  loading: boolean
  error: string | null
  source: string
  competitors: CompetitorPrice[]
}

function mapCondition(c: DeviceCondition): 'excellent' | 'good' | 'fair' | 'broken' {
  if (c === 'new' || c === 'excellent') return 'excellent'
  if (c === 'fair') return 'fair'
  if (c === 'poor') return 'broken'
  return 'good'
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

export default function NewTradeInPage() {
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
  const [tab, setTab] = useState('manual')
  const [csvData, setCsvData] = useState<CSVRow[]>([])
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const latestLookupRequestRef = useRef<Record<number, number>>({})
  const nextLookupRequestIdRef = useRef(1)

  // Pricing state (internal roles only)
  const [itemPrices, setItemPrices] = useState<Record<number, ItemPrice>>({})
  // marginOverride: empty string = use engine default, number = override margin %
  const [marginOverride, setMarginOverride] = useState<string>('')
  // beatOverride: 'amount' mode uses flat $, 'percent' mode uses %. Empty = use saved settings default.
  const [beatMode, setBeatMode] = useState<'amount' | 'percent'>('amount')
  const [beatOverride, setBeatOverride] = useState<string>('')

  useEffect(() => {
    fetch('/api/devices?page_size=150&sort_by=make&sort_order=asc').then(r => r.json()).then(d => setDevices(d.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (isCustomer) {
      router.replace('/orders/new')
    }
  }, [isCustomer, router])

  // Price lookup for internal staff
  const lookupPrice = useCallback(async (index: number, deviceId: string, storage: string, condition: DeviceCondition, beatModeArg?: 'amount' | 'percent', beatValArg?: string) => {
    if (!isInternal) return
    if (!deviceId || !storage) {
      delete latestLookupRequestRef.current[index]
      setItemPrices(prev => ({ ...prev, [index]: { engine_price: 0, manual_price: '', cpo_unit_price: 0, loading: false, error: null, source: '', competitors: [] } }))
      return
    }

    const requestId = nextLookupRequestIdRef.current++
    latestLookupRequestRef.current[index] = requestId

    setItemPrices(prev => ({ ...prev, [index]: { engine_price: 0, manual_price: '', cpo_unit_price: 0, loading: true, error: null, source: '', competitors: [] } }))

    const effectiveBeatMode = beatModeArg ?? beatMode
    const effectiveBeatVal = beatValArg ?? beatOverride
    const beatNum = effectiveBeatVal !== '' ? parseFloat(effectiveBeatVal) : null
    const beatBody: Record<string, number> = {}
    if (beatNum !== null && !Number.isNaN(beatNum) && beatNum >= 0) {
      if (effectiveBeatMode === 'percent') beatBody.beat_competitor_percent = beatNum
      else beatBody.beat_competitor_amount = beatNum
    }

    try {
      const res = await fetch('/api/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 'v2', device_id: deviceId, storage, carrier: 'Unlocked', condition, ...beatBody }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success && data.trade_price > 0) {
          if (latestLookupRequestRef.current[index] !== requestId) return
          setItemPrices(prev => ({
            ...prev,
            [index]: {
              engine_price: data.trade_price,
              manual_price: '',
              cpo_unit_price: data.cpo_price || 0,
              loading: false,
              error: null,
              source: data.price_source || 'Pricing Engine V2',
              competitors: (data.competitors || []) as CompetitorPrice[],
            },
          }))
          return
        }
      }

      if (latestLookupRequestRef.current[index] !== requestId) return
      setItemPrices(prev => ({
        ...prev,
        [index]: { engine_price: 0, manual_price: '', cpo_unit_price: 0, loading: false, error: 'No price data', source: '', competitors: [] },
      }))
    } catch {
      if (latestLookupRequestRef.current[index] !== requestId) return
      setItemPrices(prev => ({
        ...prev,
        [index]: { engine_price: 0, manual_price: '', cpo_unit_price: 0, loading: false, error: 'Lookup failed', source: '', competitors: [] },
      }))
    }
  }, [isInternal, beatMode, beatOverride])

  // Manual entry helpers
  const addItem = () => {
    setItems([...items, { device_id: '', device_label: '', quantity: 1, condition: 'good', storage: '', notes: '' }])
  }
  const removeItem = (i: number) => {
    setItems(items.filter((_, idx) => idx !== i))
    latestLookupRequestRef.current = {}
    setItemPrices(prev => {
      const next = { ...prev }
      delete next[i]
      // Re-index prices after removal
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
      return { ...item, [field]: value }
    })

    setItems(newItems)

    // Trigger price lookup when device, storage, or condition changes
    if (isInternal && ['device_id', 'storage', 'condition'].includes(field)) {
      const updatedItem = newItems[index]
      if (updatedItem) lookupPrice(index, updatedItem.device_id, updatedItem.storage, updatedItem.condition)
    }
  }

  const updateManualPrice = (index: number, val: string) => {
    setItemPrices(prev => ({
      ...prev,
      [index]: {
        ...(prev[index] || { engine_price: 0, manual_price: '', cpo_unit_price: 0, loading: false, error: null, source: 'manual', competitors: [] }),
        manual_price: val,
      },
    }))
  }

  // CSV template download — from shared csv-templates (keeps templates in sync)
  const handleDownloadTemplate = () => {
    const csvContent = buildCsvContent(TRADE_IN_CSV_HEADERS, TRADE_IN_CSV_SAMPLE)

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'trade-in-template.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Template downloaded')
  }

  const handleDownloadExcelTemplate = async () => {
    const blob = await buildXlsxTemplateBlob('Trade-In Template', TRADE_IN_CSV_HEADERS, TRADE_IN_CSV_SAMPLE)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'trade-in-template.xlsx'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel template downloaded')
  }

  // CSV handling
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

      type ApiRow = { make: string; model: string; storage: string; condition: string; quantity: number; serials: string[]; imeis: string[] }
      const rows: CSVRow[] = (data.rows as ApiRow[] || []).map(r => ({
        device_make: r.make || '',
        device_model: r.model || '',
        quantity: String(r.quantity || 1),
        condition: r.condition || 'good',
        storage: r.storage || '',
        notes: r.serials?.length ? `Serials: ${r.serials.slice(0, 5).join(', ')}${r.serials.length > 5 ? '…' : ''}` : '',
      }))

      const errors: string[] = []
      rows.forEach((row, i) => {
        if (!row.device_make && !row.device_model) errors.push(`Row ${i + 1}: No device identified`)
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
    if (!customerId) {
      toast.error('Please select a customer')
      return
    }

    let orderItems: Record<string, unknown>[]

    if (tab === 'csv' && csvData.length > 0) {
      // Match CSV rows to devices (flexible: aliases, storage stripping, trim)
      const rows = csvData.map(row => {
        const device = matchDeviceFromCsv(devices, row.device_make, row.device_model)
        return {
          device_id: device?.id || '',
          quantity: parseInt(row.quantity) || 1,
          storage: row.storage || '128GB',
          condition: (row.condition?.toLowerCase() || 'good') as DeviceCondition,
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
      orderItems = rows.map(({ _row, ...r }) => r)
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
        ...(itemPrices[idx]?.engine_price > 0 ? { quoted_price: getFinalPrice(idx) } : {}),
      }))
    }

    try {
      const result = await create({
        type: 'trade_in',
        customer_id: customerId,
        items: orderItems,
        notes,
      } as Record<string, unknown>)
      toast.success('Trade-in order created successfully')
      router.push(`/orders/${result.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order')
    }
  }

  // Apply margin override: adjustedPrice = enginePrice × (1 - margin%)
  const marginPct = marginOverride !== '' ? parseFloat(marginOverride) : null
  const applyMargin = (enginePrice: number) => {
    if (marginPct === null || Number.isNaN(marginPct) || enginePrice <= 0) return enginePrice
    const factor = 1 - marginPct / 100
    if (factor <= 0) return 0
    return Math.round(enginePrice * factor * 100) / 100
  }

  // Final price per item: manual override > margin-adjusted engine price
  const getFinalPrice = (i: number) => {
    const p = itemPrices[i]
    if (!p) return 0
    if (p.manual_price !== '' && !Number.isNaN(parseFloat(p.manual_price))) return parseFloat(p.manual_price)
    return applyMargin(p.engine_price)
  }

  // Calculate quote totals
  const quoteTotalItems = items.filter((_, i) => itemPrices[i]?.engine_price > 0)
  const grandTotal = items.reduce((sum, item, i) => sum + getFinalPrice(i) * item.quantity, 0)

  if (isCustomer) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">Opening the customer order form...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/orders">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Trade-In Order</h1>
          <p className="text-muted-foreground">Create a device trade-in / buyback order</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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

        {/* Devices - Manual or CSV */}
        <Card>
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>Add devices manually or upload a CSV</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                <TabsTrigger value="csv">CSV Upload</TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="space-y-4">
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="mr-2 h-3 w-3" />Add Item</Button>
                </div>
                {items.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground">No items added yet.</p>
                ) : (
                  items.map((item, index) => {
                    const selectedDevice = devices.find(d => d.id === item.device_id)
                    const storageOptions = getStorageOptionsForDevice(selectedDevice)
                    const price = itemPrices[index]

                    return (
                      <div key={index}>
                        {index > 0 && <Separator className="mb-3" />}
                        <div className="flex items-start gap-3">
                          <div className={`flex-1 grid gap-2 ${isInternal ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
                            <Select value={item.device_id} onValueChange={v => updateItem(index, 'device_id', v)}>
                              <SelectTrigger><SelectValue placeholder="Device" /></SelectTrigger>
                              <SelectContent>
                                {devices.map(d => <SelectItem key={d.id} value={d.id}>{d.make} {d.model}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} placeholder="Qty" />
                            <Select value={item.condition} onValueChange={v => updateItem(index, 'condition', v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(CONDITION_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
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
                                ) : price?.engine_price > 0 ? (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                      <span>Trade-In</span>
                                      <span>CPO</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="text-right font-mono"
                                        placeholder={String(getFinalPrice(index))}
                                        value={price.manual_price}
                                        onChange={e => updateManualPrice(index, e.target.value)}
                                      />
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="text-right font-mono"
                                        value={price.cpo_unit_price || 0}
                                        disabled
                                      />
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">{price.source}</span>
                                  </div>
                                ) : price?.error ? (
                                  <span className="text-xs text-muted-foreground h-10 flex items-center">No price data</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground h-10 flex items-center">Unit price</span>
                                )}
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
                {/* Clear Trade-In template label at top */}
                <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 p-4">
                  <p className="font-semibold text-green-800 dark:text-green-300 text-sm">Trade-In Template</p>
                  <p className="text-xs text-muted-foreground mt-1">Use this template for device buybacks. Columns: device_make, device_model, quantity, condition, storage, notes (Make/Model also accepted). Download template to ensure correct format.</p>
                </div>

                <div className="rounded-lg border-2 border-dashed p-6 text-center">
                  <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    Download the Trade-In template or upload your own CSV or Excel file
                  </p>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button type="button" variant="outline" onClick={handleDownloadTemplate} className="border-green-600 text-green-700 hover:bg-green-50">
                      <Download className="mr-2 h-4 w-4" />Download Trade-In Template
                    </Button>
                    <Button type="button" variant="outline" onClick={handleDownloadExcelTemplate} className="border-green-600 text-green-700 hover:bg-green-50">
                      <FileSpreadsheet className="mr-2 h-4 w-4" />Download Trade-In Excel Template
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
                    {csvErrors.length > 5 && <p className="text-xs text-destructive">...and {csvErrors.length - 5} more</p>}
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
                          <TableHead>Condition</TableHead>
                          <TableHead>Storage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvData.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{row.device_make}</TableCell>
                            <TableCell>{row.device_model}</TableCell>
                            <TableCell>{row.quantity}</TableCell>
                            <TableCell><Badge variant="outline">{row.condition || 'good'}</Badge></TableCell>
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

        {/* Quote Summary (internal staff only) */}
        {isInternal && tab === 'manual' && quoteTotalItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quote Summary</CardTitle>
              <CardDescription>Review pricing before submitting.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Beat by control — re-fetches all prices when changed */}
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">Beat Competitors By</p>
                  <p className="text-xs text-muted-foreground">
                    How much above the avg competitor price to quote. Default is the saved setting ($12 flat).
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
                      placeholder={beatMode === 'percent' ? 'e.g. 5' : 'e.g. 12'}
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
                          lookupPrice(i, item.device_id, item.storage, item.condition, beatMode, beatOverride)
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
                        if (item.device_id && item.storage) {
                          lookupPrice(i, item.device_id, item.storage, item.condition, beatMode, '')
                        }
                      })
                    }}>
                      Reset
                    </Button>
                  )}
                </div>
              </div>

              {/* Margin override control */}
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">Margin Adjustment</p>
                  <p className="text-xs text-muted-foreground">
                    Override the engine margin for this quote. Engine default is already baked into prices below.
                    {marginOverride !== '' && !Number.isNaN(parseFloat(marginOverride)) && (
                      <span className="ml-1 font-medium text-foreground">
                        Applying {parseFloat(marginOverride)}% margin — prices adjusted from engine values.
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative w-28">
                    <Input
                      type="number"
                      min="0"
                      max="60"
                      step="0.5"
                      placeholder="e.g. 20"
                      value={marginOverride}
                      onChange={e => setMarginOverride(e.target.value)}
                      className="pr-7 text-right"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                  {marginOverride !== '' && (
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setMarginOverride('')}>
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
                      <TableHead>Cond.</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right text-muted-foreground">Engine Price</TableHead>
                      <TableHead className="text-right text-amber-700 bg-amber-50/60">Competitors (Trade-In)</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right font-semibold">Our Quote</TableHead>
                      <TableHead className="text-right">CPO Unit</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, i) => {
                      const price = itemPrices[i]
                      if (!price || price.engine_price <= 0) return null
                      const marginAdjusted = applyMargin(price.engine_price)
                      const finalUnit = getFinalPrice(i)
                      const isManual = price.manual_price !== '' && !Number.isNaN(parseFloat(price.manual_price))
                      const effectiveMarginPct = marginPct !== null && !Number.isNaN(marginPct) && !isManual ? marginPct : null
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium whitespace-nowrap">{item.device_label || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="capitalize text-xs">{item.condition}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{item.storage}</TableCell>
                          <TableCell className="text-right text-xs">{item.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatCurrency(price.engine_price)}</TableCell>
                          {/* Competitor prices — internal only, never shown to customers */}
                          <TableCell className="bg-amber-50/40 min-w-[200px]">
                            {price.competitors.length > 0 ? (() => {
                              const isGoRecellName = (n: string) => n.toLowerCase().includes('gorecell') || n.toLowerCase().includes('go recell') || n.toLowerCase().includes('goresell')
                              const carriers = price.competitors.filter(c => !isGoRecellName(c.name))
                              const goRecell = price.competitors.find(c => isGoRecellName(c.name))
                              const carrierAvg = carriers.length > 0
                                ? carriers.reduce((s, c) => s + c.price, 0) / carriers.length
                                : 0
                              return (
                                <div className="space-y-0.5 text-[11px]">
                                  {/* Carrier rows */}
                                  {carriers.map(c => (
                                    <div key={c.name} className="flex items-center justify-between gap-2">
                                      <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[100px]">{c.name}</span>
                                      <span className="font-mono text-amber-800">{formatCurrency(c.price)}</span>
                                    </div>
                                  ))}
                                  {/* Carrier avg subtotal */}
                                  {carriers.length >= 2 && (
                                    <div className="flex items-center justify-between gap-2 border-t border-amber-200/40 pt-0.5">
                                      <span className="text-slate-600 dark:text-slate-400 italic font-medium">Carrier avg</span>
                                      <span className="font-mono text-amber-700">{formatCurrency(carrierAvg)}</span>
                                    </div>
                                  )}
                                  {/* GoRecell row */}
                                  {goRecell && (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-amber-700 font-semibold truncate max-w-[100px]">{goRecell.name}</span>
                                      <span className="font-mono font-semibold text-amber-700">{formatCurrency(goRecell.price)}</span>
                                    </div>
                                  )}
                                  {/* Final formula result */}
                                  <div className="flex items-center justify-between gap-2 border-t border-amber-300/60 pt-0.5 mt-0.5">
                                    <span className="text-slate-800 dark:text-slate-200 font-semibold">
                                      {carrierAvg > 0 && goRecell ? '(carr + GoRecell) ÷ 2' : 'Quote'}
                                    </span>
                                    <span className="font-mono font-bold text-amber-900">{formatCurrency(price.engine_price)}</span>
                                  </div>
                                </div>
                              )
                            })() : (
                              <span className="text-xs text-muted-foreground">No data</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {effectiveMarginPct !== null
                              ? <Badge variant="outline" className="font-mono text-xs">{effectiveMarginPct}%</Badge>
                              : isManual
                                ? <span className="text-[10px] text-blue-600 font-medium">manual</span>
                                : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          {/* Editable final quote price */}
                          <TableCell className="text-right">
                            <div className="relative w-28 ml-auto">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder={String(marginAdjusted)}
                                value={price.manual_price}
                                onChange={e => updateManualPrice(i, e.target.value)}
                                className="text-right font-mono font-semibold h-8 pr-1"
                              />
                            </div>
                            <div className="text-[10px] text-muted-foreground text-right mt-0.5">
                              {isManual ? `engine: ${formatCurrency(price.engine_price)}` : formatCurrency(marginAdjusted)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{price.cpo_unit_price > 0 ? formatCurrency(price.cpo_unit_price) : '—'}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{formatCurrency(finalUnit * item.quantity)}</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="border-t-2">
                      <TableCell colSpan={9} className="text-right font-semibold">Grand Total (Trade-In)</TableCell>
                      <TableCell className="text-right font-mono font-bold text-lg">{formatCurrency(grandTotal)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Competitor prices are for internal reference only — not visible to the customer. Edit the <span className="font-medium">Our Quote</span> column per item, or use Margin % above to adjust all at once.
              </p>
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

        <div className="flex gap-2">
          <Button type="submit" disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create Trade-In Order'}
          </Button>
          <Link href="/orders">
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
