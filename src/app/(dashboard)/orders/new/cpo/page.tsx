// ============================================================================
// CREATE CPO ORDER PAGE
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useOrders } from '@/hooks/useOrders'
import { useCustomers } from '@/hooks/useCustomers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { CONDITION_CONFIG, STORAGE_OPTIONS } from '@/lib/constants'
import type { Device, DeviceCondition } from '@/types'

interface LineItem {
  device_id: string
  device_label: string
  quantity: number
  condition: DeviceCondition
  storage: string
  notes: string
}

export default function NewCPOOrderPage() {
  const router = useRouter()
  const { create, isCreating } = useOrders()
  const { customers } = useCustomers()
  const [devices, setDevices] = useState<Device[]>([])
  const [customerId, setCustomerId] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetch('/api/devices').then(r => r.json()).then(d => setDevices(d.data || [])).catch(() => {})
  }, [])

  const addItem = () => {
    setItems([...items, { device_id: '', device_label: '', quantity: 1, condition: 'good', storage: '', notes: '' }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) { toast.error('Please select a customer'); return }
    if (items.length === 0) { toast.error('Please add at least one item'); return }
    if (items.some(i => !i.device_id)) { toast.error('Please select a device for all items'); return }

    try {
      const result = await create({
        type: 'cpo',
        customer_id: customerId,
        items: items.map(i => ({
          device_id: i.device_id,
          quantity: i.quantity,
          storage: i.storage || '128GB',
          condition: i.condition,
          notes: i.notes,
        })),
        notes,
      } as any)
      toast.success('CPO order created successfully')
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
            <div><CardTitle>Devices</CardTitle><CardDescription>Add devices to this order</CardDescription></div>
            <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="mr-2 h-3 w-3" />Add Item</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">No items added. Click &quot;Add Item&quot; to start.</p>
            ) : (
              items.map((item, index) => (
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
                            <Select value={item.condition} onValueChange={v => updateItem(index, 'condition', v)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(CONDITION_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Storage</Label>
                          <Select value={item.storage} onValueChange={v => updateItem(index, 'storage', v)}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {STORAGE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Notes</Label>
                          <Input placeholder="Optional notes" value={item.notes} onChange={e => updateItem(index, 'notes', e.target.value)} />
                        </div>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="mt-5 shrink-0" onClick={() => removeItem(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

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
