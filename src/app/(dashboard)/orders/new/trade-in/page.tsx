// ============================================================================
// CREATE TRADE-IN ORDER PAGE
// ============================================================================

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, X, Upload, FileSpreadsheet, Download } from 'lucide-react'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { useOrders } from '@/hooks/useOrders'
import { useCustomers } from '@/hooks/useCustomers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CONDITION_CONFIG, STORAGE_OPTIONS } from '@/lib/constants'
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

export default function NewTradeInPage() {
  const router = useRouter()
  const { create, isCreating } = useOrders()
  const { customers } = useCustomers()
  const [devices, setDevices] = useState<Device[]>([])
  const [customerId, setCustomerId] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')
  const [tab, setTab] = useState('manual')
  const [csvData, setCsvData] = useState<CSVRow[]>([])
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/devices').then(r => r.json()).then(d => setDevices(d.data || [])).catch(() => {})
  }, [])

  // Manual entry helpers
  const addItem = () => {
    setItems([...items, { device_id: '', device_label: '', quantity: 1, condition: 'good', storage: '', notes: '' }])
  }
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (index: number, field: string, value: string | number) => {
    setItems(items.map((item, i) => {
      if (i !== index) return item
      if (field === 'device_id') {
        const dev = devices.find(d => d.id === value)
        return { ...item, device_id: value as string, device_label: dev ? `${dev.make} ${dev.model}` : '' }
      }
      return { ...item, [field]: value }
    }))
  }

  // CSV template download
  const handleDownloadTemplate = () => {
    const headers = ['device_make', 'device_model', 'quantity', 'condition', 'storage', 'notes']
    const sampleData = [
      ['Apple', 'iPhone 13', '5', 'good', '128GB', 'Sample device'],
      ['Samsung', 'Galaxy S21', '3', 'excellent', '256GB', ''],
    ]

    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => row.join(','))
    ].join('\n')

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
        const rows = results.data as CSVRow[]

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
    if (!customerId) { toast.error('Please select a customer'); return }

    let orderItems: any[]

    if (tab === 'csv' && csvData.length > 0) {
      // Match CSV rows to devices
      orderItems = csvData.map(row => {
        const device = devices.find(d =>
          d.make.toLowerCase() === row.device_make?.toLowerCase() &&
          d.model.toLowerCase() === row.device_model?.toLowerCase()
        )
        return {
          device_id: device?.id || '',
          quantity: parseInt(row.quantity) || 1,
          claimed_condition: (row.condition?.toLowerCase() || 'good') as DeviceCondition,
          notes: row.notes || '',
        }
      })
    } else {
      if (items.length === 0) { toast.error('Please add at least one item'); return }
      orderItems = items.map(i => ({
        device_id: i.device_id,
        quantity: i.quantity,
        claimed_condition: i.condition,
        notes: i.notes,
      }))
    }

    try {
      const result = await create({
        type: 'trade_in',
        customer_id: customerId,
        items: orderItems,
        notes,
      } as any)
      toast.success('Trade-in order created successfully')
      router.push(`/orders/${result.id}`)
    } catch {
      toast.error('Failed to create order')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/orders"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">New Trade-In Order</h1>
          <p className="text-muted-foreground">Create a device trade-in / buyback order</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer */}
        <Card>
          <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
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
                  items.map((item, index) => (
                    <div key={index}>
                      {index > 0 && <Separator className="mb-3" />}
                      <div className="flex items-start gap-3">
                        <div className="flex-1 grid gap-2 sm:grid-cols-4">
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
                              {STORAGE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}><X className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="csv" className="space-y-4">
                <div className="rounded-lg border-2 border-dashed p-6 text-center">
                  <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    Upload a CSV with columns: device_make, device_model, quantity, condition, storage, notes
                  </p>
                  <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  <div className="flex gap-2 justify-center">
                    <Button type="button" variant="outline" onClick={handleDownloadTemplate}>
                      <Download className="mr-2 h-4 w-4" />Download Template
                    </Button>
                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />Choose CSV File
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

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            <Textarea placeholder="Any additional notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Trade-In Order'}</Button>
          <Link href="/orders"><Button variant="outline" type="button">Cancel</Button></Link>
        </div>
      </form>
    </div>
  )
}
