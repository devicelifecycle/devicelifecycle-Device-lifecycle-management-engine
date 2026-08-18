'use client'

// ============================================================================
// END CUSTOMER CONSOLE — Device / Asset Register
// ============================================================================
// The customer's own inventory: register a device, assign it to someone,
// retire it, or move it. Separate from the shared device catalog — customers
// cannot see or edit the catalog. Backed by GET/POST/PATCH /api/customer/assets.

import { useEffect, useState } from 'react'
import { Boxes, Plus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useMyCustomer } from '@/hooks/useCustomers'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { ASSET_STATUSES, ASSET_STATUS_LABEL, canTransitionAsset, type AssetStatus } from '@/lib/assets'

interface Asset {
  id: string
  label: string
  serial_number: string | null
  status: AssetStatus
  assigned_to: string | null
  location: string | null
  notes: string | null
  created_at: string
}

const STATUS_STYLE: Record<AssetStatus, string> = {
  registered: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  assigned: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  retired: 'bg-muted text-muted-foreground',
}

export default function CustomerAssetsPage() {
  const { customer, isLoading: loadingCustomer } = useMyCustomer()
  const [assets, setAssets] = useState<Asset[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const limit = 20

  const load = () => {
    if (!customer?.id) return
    setLoading(true)
    fetch(`/api/customer/assets?customer_id=${customer.id}&page=${page}&limit=${limit}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: Asset[]; total?: number } | null) => {
        if (d) { setAssets(d.data ?? []); setTotal(d.total ?? 0) }
      })
      .catch(() => toast.error('Could not load your device list'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [customer?.id, page])

  const changeStatus = async (asset: Asset, status: AssetStatus) => {
    if (!canTransitionAsset(asset.status, status)) return
    const res = await fetch('/api/customer/assets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: asset.id, status }),
    })
    if (!res.ok) { toast.error('Could not update status'); return }
    toast.success(`Marked ${ASSET_STATUS_LABEL[status].toLowerCase()}`)
    load()
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Boxes className="h-6 w-6 text-primary" /> Device Register</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your organization&apos;s own device list — register, assign, move, and retire devices as needed.</p>
        </div>
        <Button type="button" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? <X className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
          {formOpen ? 'Cancel' : 'Register device'}
        </Button>
      </div>

      {formOpen && customer?.id && (
        <RegisterAssetForm customerId={customer.id} onDone={() => { setFormOpen(false); load() }} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Devices</CardTitle>
          <CardDescription>{total} device{total === 1 ? '' : 's'} registered.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCustomer || loading ? (
            <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : assets.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No devices registered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned to</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.label}</TableCell>
                      <TableCell className="font-mono text-xs">{a.serial_number || '—'}</TableCell>
                      <TableCell>
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status]}`}>{ASSET_STATUS_LABEL[a.status]}</span>
                      </TableCell>
                      <TableCell>{a.assigned_to || '—'}</TableCell>
                      <TableCell>{a.location || '—'}</TableCell>
                      <TableCell className="text-right">
                        <AssetActions asset={a} onChange={changeStatus} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-4"><Pagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AssetActions({ asset, onChange }: { asset: Asset; onChange: (a: Asset, s: AssetStatus) => void }) {
  const options = ASSET_STATUSES.filter((s) => canTransitionAsset(asset.status, s))
  if (options.length === 0) return null
  return (
    <Select value="" onValueChange={(v) => onChange(asset, v as AssetStatus)}>
      <SelectTrigger className="ml-auto h-8 w-[140px] text-xs"><SelectValue placeholder="Change status" /></SelectTrigger>
      <SelectContent>
        {options.map((s) => <SelectItem key={s} value={s}>{ASSET_STATUS_LABEL[s]}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function RegisterAssetForm({ customerId, onDone }: { customerId: string; onDone: () => void }) {
  const [label, setLabel] = useState('')
  const [serial, setSerial] = useState('')
  const [location, setLocation] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!label.trim()) { toast.error('Device name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/customer/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          label: label.trim(),
          serial_number: serial.trim() || undefined,
          location: location.trim() || undefined,
          assigned_to: assignedTo.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Could not register device'); return }
      toast.success('Device registered')
      onDone()
    } catch {
      toast.error('Could not register device')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Register a device</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Device name *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="iPhone 15 — Sales Team" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Serial / IMEI</Label>
            <Input className="font-mono" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assigned to</Label>
            <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Name or team (optional)" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Register device
        </Button>
      </CardContent>
    </Card>
  )
}
