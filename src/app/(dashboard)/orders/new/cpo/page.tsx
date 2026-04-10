// ============================================================================
// CREATE CPO ORDER PAGE
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { STORAGE_OPTIONS } from '@/lib/constants'
import { matchDeviceFromCsv } from '@/lib/device-match'
import { formatCurrency } from '@/lib/utils'
import {
  CPO_CSV_HEADERS,
  CPO_CSV_SAMPLE,
  CSV_COLUMN_ALIASES,
  buildCsvContent,
  buildXlsxTemplateBlob,
  parseTabularUpload,
} from '@/lib/csv-templates'
import type { Device, DeviceCondition } from '@/types'

interface CSVRow {
  device_make: string
  device_model: string
  quantity: string
  storage: string
  notes: string
}

// CPO orders are always 'good' condition — no condition selection needed
const CPO_CONDITION: DeviceCondition = 'good'

interface CpoCompetitorPrice {
  name: string
  sell_price: number
}

interface ItemPrice {
  engine_cpo_price: number    // CPO price from engine
  manual_price: string        // user override (empty = use engine)
  loading: boolean
  error: string | null
  source: string
  cpo_competitors: CpoCompetitorPrice[]
}

interface LineItem {
  device_id: string
  device_label: string
  quantity: number
  storage: string
  notes: string
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

  // Pricing state (internal roles only)
  const [itemPrices, setItemPrices] = useState<Record<number, ItemPrice>>({})
  const [beatMode, setBeatMode] = useState<'amount' | 'percent'>('amount')
  const [beatOverride, setBeatOverride] = useState<string>('')

  useEffect(() => {
    fetch('/api/devices?page_size=500&for_order_creation=1').then(r => r.json()).then(d => setDevices(d.data || [])).catch(() => {})
  }, [])

  const lookupPrice = useCallback(async (index: number, deviceId: string, storage: string, beatModeArg?: 'amount' | 'percent', beatValArg?: string) => {
    if (!isInternal) return
    if (!deviceId || !storage) {
      delete latestLookupRequestRef.current[index]
      setItemPrices(prev => ({
        ...prev,
        [index]: { engine_cpo_price: 0, manual_price: '', loading: false, error: null, source: '', cpo_competitors: [] },
      }))
      return
    }

    const requestId = nextLookupRequestIdRef.current++
    latestLookupRequestRef.current[index] = requestId

    setItemPrices(prev => ({
      ...prev,
      [index]: { engine_cpo_price: 0, manual_price: '', loading: true, error: null, source: '', cpo_competitors: [] },
    }))

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
        body: JSON.stringify({ version: 'v2', device_id: deviceId, storage, carrier: 'Unlocked', condition: CPO_CONDITION, ...beatBody }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success && data.cpo_price > 0) {
          if (latestLookupRequestRef.current[index] !== requestId) return
          setItemPrices(prev => ({
            ...prev,
            [index]: {
              engine_cpo_price: data.cpo_price,
              manual_price: '',
              loading: false,
              error: null,
              source: data.price_source || 'Pricing Engine V2',
              cpo_competitors: (data.cpo_competitors || []) as CpoCompetitorPrice[],
            },
          }))
          return
        }
      }

      if (latestLookupRequestRef.current[index] !== requestId) return
      setItemPrices(prev => ({
        ...prev,
        [index]: { engine_cpo_price: 0, manual_price: '', loading: false, error: 'No price data', source: '', cpo_competitors: [] },
      }))
    } catch {
      if (latestLookupRequestRef.current[index] !== requestId) return
      setItemPrices(prev => ({
        ...prev,
        [index]: { engine_cpo_price: 0, manual_price: '', loading: false, error: 'Lookup failed', source: '', cpo_competitors: [] },
      }))
    }
  }, [isInternal, beatMode, beatOverride])

  const addItem = () => {
    setItems([...items, { device_id: '', device_label: '', quantity: 1, storage: '', notes: '' }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
    latestLookupRequestRef.current = {}
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

    if (isInternal && ['device_id', 'storage'].includes(field)) {
      const updated = newItems[index]
      if (updated) lookupPrice(index, updated.device_id, updated.storage)
    }
  }

  const updateManualPrice = (index: number, val: string) => {
    setItemPrices(prev => ({
      ...prev,
      [index]: {
        ...(prev[index] || { engine_cpo_price: 0, manual_price: '', loading: false, error: null, source: 'manual', cpo_competitors: [] }),
        manual_price: val,
      },
    }))
  }

  const getFinalPrice = (i: number) => {
    const p = itemPrices[i]
    if (!p) return 0
    if (p.manual_price !== '' && !Number.isNaN(parseFloat(p.manual_price))) return parseFloat(p.manual_price)
    return p.engine_cpo_price
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
    try {
      const { rows: rawRows } = await parseTabularUpload(file)
      const errors: string[] = []
      const normalizeRow = (r: Record<string, string>): CSVRow => {
        const out: Partial<CSVRow> = {}
        for (const [k, v] of Object.entries(r)) {
          const key = k.toLowerCase().trim().replace(/\s+/g, '_')
          const mapped = CSV_COLUMN_ALIASES[key] ?? (key === 'device_make' || key === 'device_model' ? key : null)
          if (mapped) {
            out[mapped as keyof CSVRow] = String(v ?? '').trim()
          }
        }
        return {
          device_make: out.device_make ?? '',
          device_model: out.device_model ?? '',
          quantity: out.quantity ?? '',
          storage: out.storage ?? '',
          notes: out.notes ?? '',
        }
      }
      const rows = rawRows.map(normalizeRow)
      rows.forEach((row, i) => {
        if (!row.device_make) errors.push(`Row ${i + 1}: Missing device_make`)
        if (!row.device_model) errors.push(`Row ${i + 1}: Missing device_model`)
        if (!row.quantity || isNaN(Number(row.quantity))) errors.push(`Row ${i + 1}: Invalid quantity`)
      })
      setCsvErrors(errors)
      setCsvData(rows)
      if (errors.length === 0) toast.success(`${rows.length} rows parsed successfully`)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      toast.error('Failed to parse file. Use CSV or Excel (.xlsx/.xls).')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) { toast.error('Please select a customer'); return }

    let orderItems: { device_id: string; quantity: number; storage: string; condition: DeviceCondition; notes: string }[]
    if (tab === 'csv' && csvData.length > 0) {
      const rows = csvData.map(row => {
        const device = matchDeviceFromCsv(devices, row.device_make, row.device_model)
        return {
          device_id: device?.id || '',
          quantity: parseInt(row.quantity) || 1,
          storage: row.storage || '128GB',
          condition: CPO_CONDITION,
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
      orderItems = items.map(i => ({
        device_id: i.device_id,
        quantity: i.quantity,
        storage: i.storage || '128GB',
        condition: CPO_CONDITION,
        notes: i.notes,
      }))
    }

    try {
      const result = await create({
        type: 'cpo',
        customer_id: customerId,
        items: orderItems,
        notes,
      } as any)
      toast.success('CPO order created successfully')
      router.push(`/orders/${result.id}`)
    } catch (err) {
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
                            <Select value={item.device_id} onValueChange={v => updateItem(index, 'device_id', v)}>
                              <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                              <SelectContent>
                                {devices.map(d => <SelectItem key={d.id} value={d.id}>{d.make} {d.model}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Qty</Label>
                              <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Condition</Label>
                              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                                CPO (Good)
                              </div>
                            </div>
                          </div>
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
                        {isInternal && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {price?.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {price?.engine_cpo_price > 0 && !price.loading && (
                              <span className="font-medium text-foreground">CPO Price: {formatCurrency(price.engine_cpo_price)} <span className="font-normal text-muted-foreground">/ unit ({price.source})</span></span>
                            )}
                            {price?.error && <span className="text-muted-foreground">No price data</span>}
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
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-4">
                  <p className="font-semibold text-blue-800 dark:text-blue-300 text-sm">CPO Template</p>
                  <p className="text-xs text-muted-foreground mt-1">Use this template for Certified Pre-Owned bulk purchases. Columns: device_make, device_model, quantity, storage, notes (Make/Model also accepted). Download template to ensure correct format.</p>
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
        {isInternal && tab === 'manual' && items.some((_, i) => (itemPrices[i]?.engine_cpo_price ?? 0) > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quote Summary</CardTitle>
              <CardDescription>CPO sell pricing for this order. Competitor sell prices shown for internal reference only.</CardDescription>
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
                          lookupPrice(i, item.device_id, item.storage, beatMode, beatOverride)
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
                        if (item.device_id && item.storage) lookupPrice(i, item.device_id, item.storage, beatMode, '')
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
                      <TableHead>Storage</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right text-muted-foreground">Engine CPO</TableHead>
                      <TableHead className="text-right text-amber-700 bg-amber-50/60">Competitors (Sell)</TableHead>
                      <TableHead className="text-right font-semibold">Our CPO Quote</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, i) => {
                      const price = itemPrices[i]
                      if (!price || price.engine_cpo_price <= 0) return null
                      const isManual = price.manual_price !== '' && !Number.isNaN(parseFloat(price.manual_price))
                      const finalUnit = getFinalPrice(i)
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium whitespace-nowrap">{item.device_label || '—'}</TableCell>
                          <TableCell className="text-xs">{item.storage}</TableCell>
                          <TableCell className="text-right text-xs">{item.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatCurrency(price.engine_cpo_price)}</TableCell>
                          {/* Competitor sell prices — internal only */}
                          <TableCell className="bg-amber-50/40 min-w-[160px]">
                            {price.cpo_competitors.length > 0 ? (
                              <div className="space-y-0.5">
                                {price.cpo_competitors.map(c => (
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
                          {/* Editable final CPO quote price */}
                          <TableCell className="text-right">
                            <div className="relative w-28 ml-auto">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder={String(price.engine_cpo_price)}
                                value={price.manual_price}
                                onChange={e => updateManualPrice(i, e.target.value)}
                                className="text-right font-mono font-semibold h-8 pr-1"
                              />
                            </div>
                            {isManual && (
                              <div className="text-[10px] text-blue-600 text-right mt-0.5">manual · engine: {formatCurrency(price.engine_cpo_price)}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">{formatCurrency(finalUnit * item.quantity)}</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="border-t-2">
                      <TableCell colSpan={6} className="text-right font-semibold">Grand Total (CPO)</TableCell>
                      <TableCell className="text-right font-mono font-bold text-lg">
                        {formatCurrency(items.reduce((sum, item, i) => sum + getFinalPrice(i) * item.quantity, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Competitor sell prices are for internal reference only — not visible to the customer. Edit the <span className="font-medium">Our CPO Quote</span> column to override the engine price per item.
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
    </div>
  )
}
