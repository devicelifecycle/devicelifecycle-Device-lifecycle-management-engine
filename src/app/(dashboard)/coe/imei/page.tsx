'use client'

// ============================================================================
// CPO IMEI INTAKE & WARRANTY LOOKUP
// ============================================================================
// Records the devices a vendor supplied against a CPO purchase order — each one
// stamped with the source vendor — so the outstanding balance is always visible
// and a warranty claim can be traced back to whoever sent the device.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Package, Search, Upload, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useDebounce } from '@/hooks/useDebounce'
import { parseImeiRows } from '@/lib/imei-intake'

interface OrderOption { id: string; order_number: string; status: string; total_quantity: number | null; customer?: { company_name?: string } | null }
interface VendorOption { id: string; company_name: string }
interface Fulfillment { ordered: number; received: number; outstanding: number; byVendor: { vendorId: string | null; name: string; count: number }[] }

export default function CpoImeiIntakePage() {
  const [orderSearch, setOrderSearch] = useState('')
  const [orders, setOrders] = useState<OrderOption[]>([])
  const [order, setOrder] = useState<OrderOption | null>(null)
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [vendorId, setVendorId] = useState('')
  const [imeiText, setImeiText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null)
  const debouncedOrderSearch = useDebounce(orderSearch)

  const vendorNames = useMemo(() => new Map(vendors.map((v) => [v.id, v.company_name])), [vendors])

  useEffect(() => {
    fetch('/api/vendors?page_size=200')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setVendors(((d.data ?? d) as VendorOption[]).filter((v) => v.company_name)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const q = debouncedOrderSearch.trim()
    fetch(`/api/orders?type=cpo&page_size=15${q ? `&search=${encodeURIComponent(q)}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOrders((d.data ?? d) as OrderOption[]))
      .catch(() => {})
  }, [debouncedOrderSearch])

  const loadFulfillment = useCallback(async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}/imei-intake`)
    if (res.ok) setFulfillment(await res.json())
  }, [])

  const selectOrder = (o: OrderOption) => {
    setOrder(o)
    setFulfillment(null)
    loadFulfillment(o.id)
  }

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setImeiText(String(reader.result || ''))
    reader.readAsText(file)
  }

  const submit = async () => {
    if (!order) { toast.error('Pick a CPO order first'); return }
    if (!vendorId) { toast.error('Pick the vendor who supplied these devices'); return }
    const rows = parseImeiRows(imeiText)
    if (rows.length === 0) { toast.error('Add at least one IMEI (one per line)'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/imei-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendorId, rows }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Could not record IMEIs'); return }
      toast.success(`${data.inserted} device${data.inserted === 1 ? '' : 's'} recorded${data.skipped ? ` · ${data.skipped} duplicate skipped` : ''}`)
      setImeiText('')
      if (data.fulfillment) setFulfillment(data.fulfillment)
    } catch {
      toast.error('Could not record IMEIs')
    } finally {
      setSubmitting(false)
    }
  }

  const pct = fulfillment && fulfillment.ordered > 0
    ? Math.min(100, Math.round((fulfillment.received / fulfillment.ordered) * 100))
    : 0

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Package className="h-6 w-6 text-primary" /> CPO IMEI Intake
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record the devices a vendor supplied against a CPO order. Each device is tied to its source vendor for warranty tracking, and the outstanding balance updates live.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose the CPO order</CardTitle>
          <CardDescription>Search by order number.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search CPO orders…" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
          </div>
          <div className="max-h-52 space-y-1.5 overflow-y-auto">
            {orders.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => selectOrder(o)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${order?.id === o.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <span className="font-medium">{o.order_number}</span>
                <span className="text-xs text-muted-foreground">{o.customer?.company_name || '—'} · {o.total_quantity ?? 0} units · {o.status}</span>
              </button>
            ))}
            {orders.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No CPO orders found.</p>}
          </div>
        </CardContent>
      </Card>

      {order && fulfillment && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fulfillment — {order.order_number}</CardTitle>
            <CardDescription>{fulfillment.received} of {fulfillment.ordered} received.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-7 overflow-hidden rounded-md border bg-amber-100 dark:bg-amber-950/40">
              <div className="flex h-full items-center bg-green-600 pl-3 text-xs font-semibold text-white transition-all" style={{ width: `${pct}%` }}>
                {pct >= 12 ? `${fulfillment.received} in` : ''}
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {fulfillment.outstanding > 0
                  ? <span className="text-amber-600">{fulfillment.outstanding} still outstanding</span>
                  : <span className="text-green-600">Fully fulfilled</span>}
              </span>
              <span className="text-muted-foreground tabular-nums">{fulfillment.ordered} ordered</span>
            </div>
            {fulfillment.byVendor.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                {fulfillment.byVendor.map((v) => (
                  <div key={v.vendorId ?? 'none'} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5 text-sm">
                    <span className="font-medium">{v.name}</span>
                    <span className="tabular-nums text-muted-foreground">{v.count} device{v.count === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Upload the vendor's IMEIs</CardTitle>
          <CardDescription>Pick the vendor, then paste one IMEI per line (or <span className="font-medium">IMEI, serial</span>). You can also load a .csv/.txt file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm space-y-1.5">
            <Label className="text-xs">Source vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>
                {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            rows={7}
            className="font-mono text-sm"
            placeholder={'353915090000001\n353915090000002, SN-ABC123'}
            value={imeiText}
            onChange={(e) => setImeiText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
              <Upload className="h-4 w-4" /> Load file
              <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <span className="text-sm text-muted-foreground">{parseImeiRows(imeiText).length} IMEI{parseImeiRows(imeiText).length === 1 ? '' : 's'} ready</span>
            <Button type="button" onClick={submit} disabled={submitting || !order} className="ml-auto">
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Package className="mr-1 h-4 w-4" />}
              Record devices
            </Button>
          </div>
        </CardContent>
      </Card>

      <WarrantyLookup vendorNames={vendorNames} />
    </div>
  )
}

function WarrantyLookup({ vendorNames }: { vendorNames: Map<string, string> }) {
  const [imei, setImei] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<null | 'notfound' | Record<string, unknown>>(null)

  const lookup = async () => {
    const q = imei.trim()
    if (q.length < 4) { toast.error('Enter a full IMEI'); return }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/imei/${encodeURIComponent(q)}`)
      if (res.status === 404) { setResult('notfound'); return }
      if (!res.ok) { toast.error('Lookup failed'); return }
      setResult(await res.json())
    } catch {
      toast.error('Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  const rec = result && result !== 'notfound' ? result : null
  const device = rec?.device as { make?: string; model?: string } | null | undefined
  const vendorId = rec?.source_vendor_id as string | undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Warranty lookup</CardTitle>
        <CardDescription>Enter an IMEI to see which vendor supplied it and its warranty window.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input className="font-mono" placeholder="Enter IMEI…" value={imei} onChange={(e) => setImei(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} />
          <Button type="button" variant="outline" onClick={lookup} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
          </Button>
        </div>
        {result === 'notfound' && <p className="text-sm text-muted-foreground">No device found for that IMEI.</p>}
        {rec && (
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Device</span><div className="font-medium">{device ? `${device.make ?? ''} ${device.model ?? ''}`.trim() || '—' : '—'}</div></div>
            <div><span className="text-muted-foreground">Source vendor</span><div className="font-medium">{(vendorId && vendorNames.get(vendorId)) || 'Unattributed'}</div></div>
            <div><span className="text-muted-foreground">Warranty expiry</span><div className="font-medium">{(rec.warranty_expiry as string) || '—'}</div></div>
            <div><span className="text-muted-foreground">Status</span><div className="font-medium capitalize">{String(rec.triage_status ?? '—').replace(/_/g, ' ')}</div></div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
