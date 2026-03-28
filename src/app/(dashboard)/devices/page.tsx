// ============================================================================
// DEVICE CATALOG PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Search, Package, Smartphone, Tablet, Laptop, Watch } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DEVICE_BRANDS } from '@/lib/constants'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { Pagination } from '@/components/ui/pagination'
import type { Device } from '@/types'

export default function DevicesPage() {
  const { user } = useAuth()
  const canCreate = user?.role === 'admin' || user?.role === 'coe_manager'
  const [devices, setDevices] = useState<Device[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [makeFilter, setMakeFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    make: '',
    model: '',
    variant: '',
    category: '',
    sku: '',
    storage_options: '',
    colors: '',
  })

  const fetchDevices = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.append('search', debouncedSearch)
      if (makeFilter) params.append('make', makeFilter)
      if (categoryFilter) params.append('category', categoryFilter)
      params.append('page', String(page))
      params.append('page_size', '50')
      const res = await fetch(`/api/devices?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setDevices(data.data || [])
        setTotal(data.total || 0)
        setTotalPages(data.total_pages || 1)
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false)
    }
  }, [debouncedSearch, page, makeFilter, categoryFilter])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const storageList = form.storage_options?.split(/[,;]/).map(s => s.trim()).filter(Boolean) || []
      const colorList = form.colors?.split(/[,;]/).map(c => c.trim()).filter(Boolean) || []
      const body = {
        make: form.make,
        model: form.model,
        variant: form.variant || undefined,
        category: form.category || undefined,
        sku: form.sku || undefined,
        specifications: (storageList.length || colorList.length) ? { storage_options: storageList, colors: colorList } : undefined,
      }
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to create device')
      toast.success('Device added to catalog')
      setDialogOpen(false)
      setForm({ make: '', model: '', variant: '', category: '', sku: '', storage_options: '', colors: '' })
      fetchDevices()
    } catch {
      toast.error('Failed to create device')
    } finally {
      setCreating(false)
    }
  }

  const MAKE_ORDER = ['Apple', 'Samsung', 'Google'] as const

  const categoryColors: Record<string, { bg: string; text: string }> = {
    phone: { bg: 'bg-blue-500/10', text: 'text-blue-700' },
    tablet: { bg: 'bg-purple-500/10', text: 'text-purple-700' },
    laptop: { bg: 'bg-green-500/10', text: 'text-green-700' },
    watch: { bg: 'bg-orange-500/10', text: 'text-orange-700' },
    other: { bg: 'bg-gray-500/10', text: 'text-gray-700' },
  }

  const specs = (d: Device) => (d.specifications || {}) as { storage_options?: string[]; colors?: string[] }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Device Catalog</h1>
          <p className="text-muted-foreground mt-1">Manage the master device list</p>
        </div>
        {canCreate && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20"><Plus className="mr-2 h-4 w-4" />Add Device</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Device</DialogTitle>
              <DialogDescription>Add a device model to the catalog</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Brand / Make *</Label>
                <Select value={form.make} onValueChange={v => setForm(f => ({ ...f, make: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {DEVICE_BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model *</Label>
                <Input placeholder="e.g. iPhone 15 Pro Max" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>Variant</Label>
                  <Input placeholder="e.g. 256GB Space Black" value={form.variant} onChange={e => setForm(f => ({ ...f, variant: e.target.value }))} />
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
              </div>
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input placeholder="e.g. APL-IP15PM-256-BLK" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label>Storage (comma-separated)</Label>
                  <Input placeholder="e.g. 64GB, 128GB, 256GB" value={form.storage_options} onChange={e => setForm(f => ({ ...f, storage_options: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Colors (comma-separated)</Label>
                  <Input placeholder="e.g. Black, Silver, Blue" value={form.colors} onChange={e => setForm(f => ({ ...f, colors: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || !form.make || !form.model}>
                {creating ? 'Adding...' : 'Add Device'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search make, model, SKU..." className="pl-10 bg-background" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={makeFilter || 'all'} onValueChange={v => { setMakeFilter(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {MAKE_ORDER.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              {DEVICE_BRANDS.filter(b => !(MAKE_ORDER as readonly string[]).includes(b)).map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter || 'all'} onValueChange={v => { setCategoryFilter(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="tablet">Tablet</SelectItem>
              <SelectItem value="laptop">Laptop</SelectItem>
              <SelectItem value="watch">Watch</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">All Devices</CardTitle>
          <CardDescription>{total} devices in catalog</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50">
                <Package className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="mt-4 text-sm font-medium">No devices in catalog</p>
              <p className="mt-1 text-xs">Add your first device to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Make</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Colors</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map(device => {
                  const s = specs(device)
                  const storageList = s.storage_options?.join(', ') || '—'
                  const colorList = s.colors?.length ? (s.colors.length > 3 ? `${s.colors.slice(0, 3).join(', ')} +${s.colors.length - 3}` : s.colors.join(', ')) : '—'
                  return (
                    <TableRow key={device.id}>
                      <TableCell>
                        <Link
                          href={`/devices/${device.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {device.make}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">{device.model}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate" title={storageList}>{storageList}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate" title={colorList}>{colorList}</TableCell>
                      <TableCell>
                        {device.category && (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${(categoryColors[device.category] || categoryColors.other).bg} ${(categoryColors[device.category] || categoryColors.other).text}`}>
                            {device.category}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">{device.sku || '—'}</TableCell>
                      <TableCell><Badge variant={device.is_active ? 'default' : 'secondary'} className="text-[11px]">{device.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  )
}
