// ============================================================================
// DEVICE DETAIL / EDIT PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DEVICE_BRANDS } from '@/lib/constants'
import type { Device } from '@/types'

export default function DeviceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [device, setDevice] = useState<Device | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({
    make: '',
    model: '',
    variant: '',
    category: '',
    sku: '',
  })

  const fetchDevice = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/devices/${params.id}`)
      if (!res.ok) throw new Error('Device not found')
      const data = await res.json()
      setDevice(data)
      setForm({
        make: data.make || '',
        model: data.model || '',
        variant: data.variant || '',
        category: data.category || '',
        sku: data.sku || '',
      })
    } catch {
      toast.error('Device not found')
      router.push('/devices')
    } finally {
      setIsLoading(false)
    }
  }, [params.id, router])

  useEffect(() => { fetchDevice() }, [fetchDevice])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/devices/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('Device updated successfully')
      fetchDevice()
    } catch {
      toast.error('Failed to update device')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!device) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/devices">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{device.make} {device.model}</h1>
            <p className="text-muted-foreground">Edit device details</p>
          </div>
        </div>
        <Badge variant={device.is_active ? 'default' : 'secondary'}>
          {device.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      {/* Edit Form */}
      <Card>
        <CardHeader>
          <CardTitle>Device Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Brand / Make</Label>
              <Select value={form.make} onValueChange={v => setForm(f => ({ ...f, make: v }))}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {DEVICE_BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder="e.g. iPhone 15 Pro Max"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Variant</Label>
              <Input
                value={form.variant}
                onChange={e => setForm(f => ({ ...f, variant: e.target.value }))}
                placeholder="e.g. 256GB Space Black"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="tablet">Tablet</SelectItem>
                  <SelectItem value="laptop">Laptop</SelectItem>
                  <SelectItem value="watch">Watch</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="e.g. APL-IP15PM-256-BLK"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={isSaving || !form.make || !form.model}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
