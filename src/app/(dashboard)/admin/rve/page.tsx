'use client'

// ============================================================================
// ADMIN — RESIDUAL VALUE QUOTE (RVE)
// ============================================================================
// Mirrors the trade-in quote (device lines → per-line value → total), but each
// line's price is scraped from the depreciation table at the chosen horizon
// instead of the live market. Admin-side; additive; no order records created.

import { useMemo, useState } from 'react'
import { ComingSoon } from '@/components/ComingSoon'
import { Plus, TrendingDown, Trash2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { residualSchedule, residualRetention } from '@/lib/rve'

interface Line { id: number; label: string; base: string }

let nextId = 1

export default function RvePage() {
  return <ComingSoon title="Residual Value" />
}

function RvePageImpl() {
  const [years, setYears] = useState('3')
  const [lines, setLines] = useState<Line[]>([{ id: nextId++, label: '', base: '' }])

  const horizon = Math.max(1, Math.min(10, Number(years) || 3))

  const priced = useMemo(
    () => lines.map((l) => {
      const base = Math.max(0, Number(l.base) || 0)
      const residual = base * residualRetention(horizon * 12)
      return { ...l, base, residual: Math.round(residual * 100) / 100 }
    }),
    [lines, horizon],
  )
  const total = useMemo(() => priced.reduce((s, l) => s + l.residual, 0), [priced])

  // Schedule for the first line with a base value, for the year-by-year view.
  const scheduleFor = priced.find((l) => l.base > 0)
  const schedule = scheduleFor ? residualSchedule(scheduleFor.base, horizon) : []

  const addLine = () => setLines((ls) => [...ls, { id: nextId++, label: '', base: '' }])
  const removeLine = (id: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls))
  const setLine = (id: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <TrendingDown className="h-6 w-6 text-primary" /> Residual Value Quote
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Same flow as a trade-in quote, but each line is priced from the depreciation table at your chosen horizon.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Devices</CardTitle>
          <CardDescription>Enter each device and its current (base) value. Residual is projected from the depreciation table.</CardDescription>
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
              <div key={l.id} className="grid items-end gap-2 sm:grid-cols-[1fr_160px_140px_auto]">
                <div className="space-y-1.5">
                  <Label className="text-xs">Device</Label>
                  <Input value={l.label} onChange={(e) => setLine(l.id, { label: e.target.value })} placeholder="iPhone 15 128GB" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Base value</Label>
                  <Input type="number" min={0} step="0.01" value={l.base} onChange={(e) => setLine(l.id, { base: e.target.value })} placeholder="0.00" />
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
