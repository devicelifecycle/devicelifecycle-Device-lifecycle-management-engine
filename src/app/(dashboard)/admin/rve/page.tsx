'use client'

// ============================================================================
// ADMIN — RESIDUAL VALUE QUOTE (RVE)
// ============================================================================
// Mirrors the trade-in quote (pick a device → its current value → per-line value
// → total), but each line's value is projected from the depreciation table at
// the chosen horizon instead of the live market. The current (base) value is
// pulled automatically from the pricing engine, and the finished quote can be
// emailed to a customer as a PDF. Admin-side; additive.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { ComingSoon } from '@/components/ComingSoon'
import { Plus, TrendingDown, Trash2, Send, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { residualSchedule, residualRetention } from '@/lib/rve'

interface DeviceOption { id: string; make: string; model: string }
interface CustomerOption { id: string; company_name?: string | null; contact_name?: string | null }
interface Line { id: number; deviceId: string; storage: string; label: string; base: number; loading: boolean }

let nextId = 1
const newLine = (): Line => ({ id: nextId++, deviceId: '', storage: '', label: '', base: 0, loading: false })

export default function RvePage() {
  return <ComingSoon title="Residual Value" />
}

function RvePageImpl() {
  const [years, setYears] = useState('3')
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [customerId, setCustomerId] = useState('')
  const [sending, setSending] = useState(false)

  const horizon = Math.max(1, Math.min(10, Number(years) || 3))

  useEffect(() => {
    fetch('/api/devices?page_size=200&for_order_creation=1&sort_by=make&sort_order=asc')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDevices(d.data || []))
      .catch(() => {})
    fetch('/api/customers?page_size=100')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCustomers(d.data || []))
      .catch(() => {})
  }, [])

  const setLine = (id: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  // Auto-pull the device's current value from the pricing engine, then depreciate.
  const lookupBase = useCallback(async (id: number, deviceId: string, storage: string) => {
    if (!deviceId || !storage) return
    setLine(id, { loading: true })
    try {
      const res = await fetch('/api/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 'v2', device_id: deviceId, storage, carrier: 'Unlocked', condition: 'good' }),
      })
      const data = res.ok ? await res.json() : null
      const base = data?.success ? Number(data.trade_price) || 0 : 0
      setLine(id, { base, loading: false })
    } catch {
      setLine(id, { base: 0, loading: false })
    }
  }, [])

  const onDevice = (id: number, deviceId: string) => {
    const d = devices.find((x) => x.id === deviceId)
    const line = lines.find((l) => l.id === id)
    const label = d ? `${d.make} ${d.model}${line?.storage ? ` ${line.storage}` : ''}` : ''
    setLine(id, { deviceId, label })
    if (line?.storage) lookupBase(id, deviceId, line.storage)
  }
  const onStorage = (id: number, storage: string) => {
    const line = lines.find((l) => l.id === id)
    const d = devices.find((x) => x.id === line?.deviceId)
    setLine(id, { storage, label: d ? `${d.make} ${d.model}${storage ? ` ${storage}` : ''}` : line?.label ?? '' })
    if (line?.deviceId && storage) lookupBase(id, line.deviceId, storage)
  }

  const priced = useMemo(
    () => lines.map((l) => ({ ...l, residual: Math.round(l.base * residualRetention(horizon * 12) * 100) / 100 })),
    [lines, horizon],
  )
  const total = useMemo(() => priced.reduce((s, l) => s + l.residual, 0), [priced])
  const scheduleFor = priced.find((l) => l.base > 0)
  const schedule = scheduleFor ? residualSchedule(scheduleFor.base, horizon) : []

  const addLine = () => setLines((ls) => [...ls, newLine()])
  const removeLine = (id: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls))

  const sendQuote = async () => {
    if (!customerId) { toast.error('Pick a customer to send the quote to'); return }
    const payload = priced.filter((l) => l.base > 0).map((l) => ({ label: l.label, baseValue: l.base }))
    if (payload.length === 0) { toast.error('Add at least one device with a value'); return }
    setSending(true)
    try {
      const res = await fetch('/api/rve/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, horizonYears: horizon, lines: payload, send: true }),
      })
      const data = await res.json()
      if (res.ok && data.sent) toast.success(`Residual value quote ${data.quoteNumber} sent`)
      else toast.error(data.error || 'Could not send the quote')
    } catch {
      toast.error('Could not send the quote')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <TrendingDown className="h-6 w-6 text-primary" /> Residual Value Quote
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Same flow as a trade-in quote — pick a device and we pull its current value, then project the residual from the depreciation table at your horizon.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Devices</CardTitle>
          <CardDescription>Choose a device and storage; the current value is pulled automatically and depreciated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-[200px] space-y-1.5">
            <Label className="text-xs">Horizon</Label>
            <Select value={years} onValueChange={setYears}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5].map((y) => <SelectItem key={y} value={String(y)}>{y} year{y > 1 ? 's' : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {priced.map((l) => (
              <div key={l.id} className="grid items-end gap-2 sm:grid-cols-[1fr_120px_140px_140px_auto]">
                <div className="space-y-1.5">
                  <Label className="text-xs">Device</Label>
                  <Select value={l.deviceId} onValueChange={(v) => onDevice(l.id, v)}>
                    <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                    <SelectContent>
                      {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.make} {d.model}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Storage</Label>
                  <Input value={l.storage} onChange={(e) => onStorage(l.id, e.target.value)} placeholder="128GB" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Current value</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
                    {l.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : l.base > 0 ? formatCurrency(l.base) : '—'}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Residual @ {horizon}y</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium tabular-nums">{formatCurrency(l.residual)}</div>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(l.id)} className="mb-0.5" aria-label="Remove line">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="mr-1 h-4 w-4" /> Add device</Button>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm font-medium">Total residual value @ {horizon}y</span>
            <span className="text-xl font-bold text-primary tabular-nums">{formatCurrency(total)}</span>
          </div>

          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Send quote to customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name || c.contact_name || 'Customer'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={sendQuote} disabled={sending || total <= 0}>
              {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Send quote
            </Button>
          </div>
        </CardContent>
      </Card>

      {schedule.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Depreciation schedule</CardTitle>
            <CardDescription>{scheduleFor?.label || 'First device'} — value by year from the depreciation table.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Year</th><th className="pb-2 pr-4 font-medium">Retained</th><th className="pb-2 font-medium text-right">Value</th>
                </tr></thead>
                <tbody>
                  {schedule.map((r) => (
                    <tr key={r.year} className="border-b last:border-0">
                      <td className="py-2 pr-4">{r.year === 0 ? 'Now' : `Year ${r.year}`}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{(r.retention * 100).toFixed(0)}%</td>
                      <td className="py-2 text-right font-medium tabular-nums">{formatCurrency(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
