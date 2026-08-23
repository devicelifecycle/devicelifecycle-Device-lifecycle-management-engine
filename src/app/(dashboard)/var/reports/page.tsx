'use client'

// ============================================================================
// VAR REPORTS — customer / order roll-ups for the caller's delegated scope
// ============================================================================
// Reads GET /api/var/reports, which enforces the same scoping as the team
// page server-side; this page just renders what it returns. Route access is
// gated by the proxy's roleRoutes entry for /var — platform admin plus the
// delegated VAR roles — same as the console page.

import { useEffect, useState } from 'react'
import { BarChart3, Loader2, UserX } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import type { RepRollup, RegionRollup } from '@/lib/var-rollup'

interface ReportsData {
  byRep: RepRollup[]
  byRegion: RegionRollup[]
  unassignedCustomerCount: number
}

const EMPTY_REPORT: ReportsData = { byRep: [], byRegion: [], unassignedCustomerCount: 0 }

export default function VarReportsPage() {
  const [data, setData] = useState<ReportsData>(EMPTY_REPORT)
  const [loading, setLoading] = useState(true)
  const [regionFilter, setRegionFilter] = useState('all')
  const [repFilter, setRepFilter] = useState('all')

  // Filters re-query the scoped endpoint rather than slicing locally — the
  // API applies ?region= / ?rep_id= on top of the caller's scope.
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (regionFilter !== 'all') params.set('region', regionFilter)
    if (repFilter !== 'all') params.set('rep_id', repFilter)
    const qs = params.toString()
    fetch(`/api/var/reports${qs ? `?${qs}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j?.data ?? EMPTY_REPORT))
      .catch(() => setData(EMPTY_REPORT))
      .finally(() => setLoading(false))
  }, [regionFilter, repFilter])

  const totalCustomers = data.byRep.reduce((s, r) => s + r.customerCount, 0)
  const totalOrders = data.byRep.reduce((s, r) => s + r.orderCount, 0)
  const totalValue = data.byRep.reduce((s, r) => s + r.orderValue, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="h-6 w-6 text-primary" /> Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer and order roll-ups across your reps, by rep or by region.
          </p>
        </div>
        <div className="flex gap-3">
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All regions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {data.byRegion.map((r) => (
                <SelectItem key={r.region} value={r.region}>{r.region}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={repFilter} onValueChange={setRepFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All reps" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reps</SelectItem>
              {data.byRep.map((r) => (
                <SelectItem key={r.repId} value={r.repId}>{r.repName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Reps" value={String(data.byRep.length)} />
            <Metric label="Customers" value={totalCustomers.toLocaleString()} />
            <Metric label="Orders" value={totalOrders.toLocaleString()} />
            <Metric label="Order value" value={formatCurrency(totalValue)} />
          </div>

          {data.unassignedCustomerCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <UserX className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {data.unassignedCustomerCount} customer{data.unassignedCustomerCount === 1 ? '' : 's'} with no
                assigned rep — not included in any rep&apos;s totals below.
              </span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By rep</CardTitle>
              <CardDescription>Sorted by order value.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.byRep.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No reps to report on yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Region</TableHead>
                        <TableHead className="text-right">Customers</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byRep.map((r) => (
                        <TableRow key={r.repId}>
                          <TableCell className="font-medium">{r.repName}</TableCell>
                          <TableCell>{r.region || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.customerCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.orderCount}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatCurrency(r.orderValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By region</CardTitle>
              <CardDescription>Sorted by order value.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.byRegion.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No regional data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Region</TableHead>
                        <TableHead className="text-right">Reps</TableHead>
                        <TableHead className="text-right">Customers</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byRegion.map((r) => (
                        <TableRow key={r.region}>
                          <TableCell className="font-medium">{r.region}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.repCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.customerCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.orderCount}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatCurrency(r.orderValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}