// ============================================================================
// DEVICE CATALOG PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useOnDbChange } from '@/hooks/useOnDbChange'
import Link from 'next/link'
import { Plus, Search, Package, Smartphone, Tablet, Laptop, Watch, Trash2, Upload, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DEVICE_BRANDS } from '@/lib/constants'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { Pagination } from '@/components/ui/pagination'
import { parseTabularUpload } from '@/lib/csv-templates'
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
  const [recyclingFilter, setRecyclingFilter] = useState<string>('')
  const [catalogMakes, setCatalogMakes] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [customMake, setCustomMake] = useState('')
  const [form, setForm] = useState({
    make: '',
    model: '',
    variant: '',
    category: '',
    sku: '',
    storage_options: '',
    colors: '',
    year: '',
    cpu: '',
    ram: '',
    recommended_for_recycling: 'other' as 'other' | 'recycling',
  })

  const fetchDevices = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.append('search', debouncedSearch)
      if (makeFilter) params.append('make', makeFilter)
      if (categoryFilter) params.append('category', categoryFilter)
      if (recyclingFilter) params.append('recycling', recyclingFilter)
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
  }, [debouncedSearch, page, makeFilter, categoryFilter, recyclingFilter])

  useEffect(() => { fetchDevices() }, [fetchDevices])
  useOnDbChange(fetchDevices)

  // Keep the brand filter in sync with whatever brands actually exist in the
  // catalog — a brand uploaded via CSV that isn't in the curated DEVICE_BRANDS
  // list still shows up here automatically, instead of being unfilterable.
  const fetchCatalogMakes = useCallback(async () => {
    try {
      const res = await fetch('/api/devices?makes_only=true')
      if (res.ok) {
        const data = await res.json()
        setCatalogMakes(data.makes || [])
      }
    } catch {
      // silently fail — falls back to the curated DEVICE_BRANDS list
    }
  }, [])

  useEffect(() => { fetchCatalogMakes() }, [fetchCatalogMakes])
  useOnDbChange(fetchCatalogMakes)

  const brandFilterOptions = Array.from(new Set([...DEVICE_BRANDS, ...catalogMakes])).sort((a, b) => a.localeCompare(b))

  const handleCreate = async () => {
    setCreating(true)
    try {
      const effectiveMake = form.make === 'Other' ? (customMake.trim() || 'Other') : form.make
      const storageList = form.storage_options?.split(/[,;]/).map(s => s.trim()).filter(Boolean) || []
      const colorList = form.colors?.split(/[,;]/).map(c => c.trim()).filter(Boolean) || []
      const specEntries: Record<string, unknown> = {}
      if (storageList.length) specEntries.storage_options = storageList
      if (colorList.length) specEntries.colors = colorList
      if (form.year.trim()) specEntries.year = form.year.trim()
      if (form.cpu.trim()) specEntries.cpu = form.cpu.trim()
      if (form.ram.trim()) specEntries.ram = form.ram.trim()
      if (form.recommended_for_recycling === 'recycling') specEntries.recommended_for_recycling = true
      if (!form.model.trim()) specEntries.partial_entry_note = 'Partial entry — model not specified'
      const body = {
        make: effectiveMake,
        model: form.model || undefined,
        variant: form.variant || undefined,
        category: form.category || undefined,
        sku: form.sku || undefined,
        specifications: Object.keys(specEntries).length ? specEntries : undefined,
      }
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to create device')
      toast.success('Device added to catalog')
      setDialogOpen(false)
      setCustomMake('')
      setForm({ make: '', model: '', variant: '', category: '', sku: '', storage_options: '', colors: '', year: '', cpu: '', ram: '', recommended_for_recycling: 'other' })
      fetchDevices()
    } catch {
      toast.error('Failed to create device')
    } finally {
      setCreating(false)
    }
  }

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const bulkFileRef = useRef<HTMLInputElement>(null)

  const handleBulkUpload = async (file: File) => {
    setBulkUploading(true)
    try {
      const { rows } = await parseTabularUpload(file)
      if (rows.length === 0) { toast.error('No rows found in file'); return }

      // Column aliases: support Make/Brand/Manufacturer → make, Model/Device → model, etc.
      const ALIASES: Record<string, string> = {
        make: 'make', brand: 'make', manufacturer: 'make', oem: 'make',
        model: 'model', device: 'model', product: 'model', device_model: 'model', device_name: 'model',
        category: 'category', type: 'category',
        storage: 'storage', capacity: 'storage',
        color: 'color', colour: 'color',
        year: 'year', sku: 'sku',
      }

      let added = 0, skipped = 0, failed = 0
      for (const rawRow of rows) {
        const mapped: Record<string, string> = {}
        for (const [key, val] of Object.entries(rawRow)) {
          const canonical = ALIASES[key.toLowerCase().trim()] || key.toLowerCase().trim()
          if (!mapped[canonical]) mapped[canonical] = String(val ?? '').trim()
        }
        const make = mapped.make || ''
        const model = mapped.model || ''
        if (!make) { skipped++; continue }

        const res = await fetch('/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            make,
            model: model || undefined,
            category: mapped.category || undefined,
            sku: mapped.sku || undefined,
            specifications: mapped.storage ? { storage_options: [mapped.storage] } : undefined,
          }),
        })
        if (res.ok) { added++ }
        else if (res.status === 409) { skipped++ }
        else { failed++ }
      }

      const parts = [`${added} added`]
      if (skipped > 0) parts.push(`${skipped} skipped (no make or duplicate)`)
      if (failed > 0) parts.push(`${failed} failed`)
      toast.success(`Bulk upload complete — ${parts.join(', ')}`)
      fetchDevices()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse file')
    } finally {
      setBulkUploading(false)
      if (bulkFileRef.current) bulkFileRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete device')
      toast.success('Device removed from catalog')
      fetchDevices()
    } catch {
      toast.error('Failed to delete device')
    } finally {
      setDeletingId(null)
    }
  }

  const MAKE_ORDER = ['Apple', 'Samsung', 'Google'] as const

  const specs = (d: Device) => (d.specifications || {}) as { storage_options?: string[]; colors?: string[]; year?: string; cpu?: string; ram?: string; recommended_for_recycling?: boolean }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Device Catalog</h1>
          <p className="text-muted-foreground mt-1">Manage the master device list</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <input
              ref={bulkFileRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleBulkUpload(f) }}
            />
            <Button
              variant="outline"
              disabled={bulkUploading}
              onClick={() => bulkFileRef.current?.click()}
            >
              {bulkUploading ? (
                <><FileSpreadsheet className="mr-2 h-4 w-4 animate-pulse" />Uploading…</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" />Upload File</>
              )}
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="success"><Plus className="mr-2 h-4 w-4" />Add Device</Button>
              </DialogTrigger>
          <DialogContent className="sm:max-w-md flex flex-col max-h-[85vh]">
            <DialogHeader className="shrink-0">
              <DialogTitle>Add New Device</DialogTitle>
              <DialogDescription>Add a device model to the catalog</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-1">
              <div className="space-y-2">
                <Label>Brand / Make *</Label>
                <Select value={form.make} onValueChange={v => { setForm(f => ({ ...f, make: v })); if (v !== 'Other') setCustomMake('') }}>
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {DEVICE_BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.make === 'Other' && (
                  <Input placeholder="Enter brand name" value={customMake} onChange={e => setCustomMake(e.target.value)} />
                )}
              </div>
              <div className="space-y-2">
                <Label>Classification</Label>
                <Select value={form.recommended_for_recycling} onValueChange={v => setForm(f => ({ ...f, recommended_for_recycling: v as 'other' | 'recycling' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="other">All other models</SelectItem>
                    <SelectItem value="recycling">Recommended for Recycling</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input placeholder="e.g. iPhone 15 Pro Max" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
                {!form.model.trim() && form.make && (
                  <p className="text-xs text-muted-foreground">Device will be saved as a partial entry — model can be added later.</p>
                )}
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
              <div className="grid gap-4 grid-cols-3">
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Input placeholder="e.g. 2019" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>CPU</Label>
                  <Input placeholder="e.g. Intel i7" value={form.cpu} onChange={e => setForm(f => ({ ...f, cpu: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>RAM</Label>
                  <Input placeholder="e.g. 16 GB" value={form.ram} onChange={e => setForm(f => ({ ...f, ram: e.target.value }))} />
                </div>
              </div>
            </div>
              <DialogFooter className="shrink-0 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating || !form.make || (form.make === 'Other' && !customMake.trim())}>
                  {creating ? 'Adding...' : 'Add Device'}
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
          </div>
        )}
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
              {brandFilterOptions.filter(b => !(MAKE_ORDER as readonly string[]).includes(b)).map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
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
          <Select value={recyclingFilter || 'all'} onValueChange={v => { setRecyclingFilter(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Recycling" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              <SelectItem value="recycling_only">Recommended for Recycling</SelectItem>
              <SelectItem value="other_only">All other models</SelectItem>
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
                  <TableHead>Brand</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>RAM</TableHead>
                  <TableHead>Status</TableHead>
                  {canCreate && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map(device => {
                  const s = specs(device)
                  const storageList = s.storage_options?.join(', ') || '—'
                  const ram = s.ram || '—'
                  return (
                    <TableRow key={device.id}>
                      <TableCell className="max-w-[140px]">
                        <Link
                          href={`/devices/${device.id}`}
                          className="block truncate font-medium text-primary hover:underline"
                          title={device.make}
                        >
                          {device.make}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate font-medium" title={device.model}>{device.model}{device.variant ? <span className="ml-1 text-xs text-muted-foreground">({device.variant})</span> : null}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate" title={storageList}>{storageList}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate" title={ram}>{ram}</TableCell>
                      <TableCell><Badge variant={device.is_active ? 'default' : 'secondary'} className="text-[11px]">{device.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                      {canCreate && (
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={deletingId === device.id}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {device.make} {device.model}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This permanently removes the device from the catalog. Orders that reference this device will not be affected, but it will no longer be selectable for new orders.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleDelete(device.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
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
