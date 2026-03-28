// ============================================================================
// CREATE TRADE-IN ORDER PAGE
// ============================================================================

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, X, Upload, FileSpreadsheet, Download, Loader2 } from 'lucide-react'
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
import { matchDeviceFromCsv } from '@/lib/device-match'
import {
  TRADE_IN_CSV_HEADERS,
  TRADE_IN_CSV_SAMPLE,
  CSV_COLUMN_ALIASES,
  buildCsvContent,
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

interface ItemPrice {
  unit_price: number
  cpo_unit_price: number
  loading: boolean
  error: string | null
  source: string
  competitor_count: number
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
  const { customer: myCustomer, isLoading: myCustomerLoading, error: myCustomerError } = useMyCustomer()
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

  // Pricing state (internal roles only)
  const [itemPrices, setItemPrices] = useState<Record<number, ItemPrice>>({})

  useEffect(() => {
    fetch('/api/devices?page_size=500&for_order_creation=1').then(r => r.json()).then(d => setDevices(d.data || [])).catch(() => {})
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
        if (data.success && data.trade_price > 0) {
          setItemPrices(prev => ({
            ...prev,
            [index]: {
              unit_price: data.trade_price,
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
  const addItem = () => {
    setItems([...items, { device_id: '', device_label: '', quantity: 1, condition: 'good', storage: '', notes: '' }])
  }
  const removeItem = (i: number) => {
    setItems(items.filter((_, idx) => idx !== i))
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

  // CSV handling
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors: string[] = []
        const rawRows = results.data as Record<string, string>[]
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
            condition: out.condition ?? '',
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
      },
      error: () => {
        toast.error('Failed to parse CSV file')
      },
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const effectiveCustomerId = isCustomer ? myCustomer?.id : customerId
    if (!effectiveCustomerId) {
      toast.error(isCustomer ? 'Loading your organization...' : 'Please select a customer')
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
        ...(itemPrices[idx]?.unit_price > 0 ? { quoted_price: itemPrices[idx].unit_price } : {}),
      }))
    }

    try {
      const result = await create({
        type: 'trade_in',
        customer_id: effectiveCustomerId,
        items: orderItems,
        notes,
      } as Record<string, unknown>)
      toast.success('Trade-in order created successfully')
      router.push(`/orders/${result.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order')
    }
  }

  // Calculate quote totals
  const quoteTotalItems = items.filter((_, i) => itemPrices[i]?.unit_price > 0)
  const grandTotal = items.reduce((sum, item, i) => sum + ((itemPrices[i]?.unit_price || 0) * item.quantity), 0)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href={isCustomer ? '/customer/requests' : '/orders'}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Trade-In Order</h1>
          <p className="text-muted-foreground">Create a device trade-in / buyback order</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer — only for internal staff (admin, sales, etc.). Customers use their own org automatically. */}
        {!isCustomer && (
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
        )}

        {isCustomer && myCustomer && (
          <Card>
            <CardHeader><CardTitle>Order for</CardTitle><CardDescription>This request will be linked to your organization</CardDescription></CardHeader>
            <CardContent>
              <p className="font-medium">{myCustomer.company_name}</p>
              <p className="text-sm text-muted-foreground">You can track this order in My Orders once submitted.</p>
            </CardContent>
          </Card>
        )}

        {isCustomer && !myCustomerLoading && myCustomerError && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-4">
              <p className="text-sm text-destructive">
                Unable to load your organization profile. Please contact support to set up your account.
              </p>
            </CardContent>
          </Card>
        )}

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
                                ) : price?.unit_price > 0 ? (
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
                                      value={price.unit_price}
                                      onChange={e => updateUnitPrice(index, parseFloat(e.target.value) || 0)}
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
                    Download the Trade-In template or upload your own CSV
                  </p>
                  <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button type="button" variant="outline" onClick={handleDownloadTemplate} className="border-green-600 text-green-700 hover:bg-green-50">
                      <Download className="mr-2 h-4 w-4" />Download Trade-In Template
                    </Button>
                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />Upload Your Own CSV
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
              <CardDescription>Review pricing before submitting. Unit prices are editable above.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Trade-In Unit</TableHead>
                    <TableHead className="text-right">CPO Unit</TableHead>
                    <TableHead className="text-right">Trade-In Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => {
                    const price = itemPrices[i]
                    if (!price || price.unit_price <= 0) return null
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.device_label || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">{item.condition}</Badge>
                        </TableCell>
                        <TableCell>{item.storage}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(price.unit_price)}</TableCell>
                        <TableCell className="text-right font-mono">{price.cpo_unit_price > 0 ? formatCurrency(price.cpo_unit_price) : '—'}</TableCell>
                        <TableCell className="text-right font-mono font-medium">{formatCurrency(price.unit_price * item.quantity)}</TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow>
                    <TableCell colSpan={6} className="text-right font-semibold">Grand Total (Trade-In)</TableCell>
                    <TableCell className="text-right font-mono font-bold text-lg">{formatCurrency(grandTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-3">
                Prices based on current competitor data. You can edit unit prices above before submitting.
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
          <Button
            type="submit"
            disabled={isCreating || (isCustomer && (myCustomerLoading || !myCustomer || !!myCustomerError))}
          >
            {isCreating ? 'Creating...' : isCustomer && (myCustomerLoading || !myCustomer) ? 'Loading...' : 'Create Trade-In Order'}
          </Button>
          <Link href={isCustomer ? '/customer/requests' : '/orders'}>
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
