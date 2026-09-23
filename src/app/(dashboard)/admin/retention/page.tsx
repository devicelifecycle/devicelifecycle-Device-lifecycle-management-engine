'use client'

// ============================================================================
// ADMIN — DATA RETENTION
// ============================================================================
// Shows, per VAR and per data class, how many rows a retention run would
// remove right now; runs one on demand; and lists the audited history of past
// runs. Deletion is live (nightly cron + the Run now control here), so the
// safety rails are in the copy as much as the code: a VAR with no policy keeps
// everything, and the manual run requires typing DELETE.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Archive, Loader2, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RETENTION_MIN_DAYS, RETENTION_MAX_DAYS } from '@/lib/retention'
import { formatDateTime } from '@/lib/utils'

interface Line {
  tenant_id: string
  tenant_name: string
  key: string
  label: string
  days: number | null
  cutoff: string | null
  would_remove: number | null
}

interface RunRow {
  id: string
  tenant_id: string | null
  data_class: string
  cutoff: string
  days_kept: number
  rows_deleted: number
  triggered_by: string
  error: string | null
  started_at: string
}

interface Report {
  dry_run: boolean
  generated_at: string
  override_days: number | null
  targets: { key: string; label: string; description: string }[]
  lines: Line[]
  failures: string[]
  history: RunRow[]
}

export default function RetentionPage() {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [running, setRunning] = useState(false)

  const load = useCallback(async (override?: string) => {
    setLoading(true)
    try {
      const qs = override ? `?days=${encodeURIComponent(override)}` : ''
      const res = await fetch(`/api/admin/retention${qs}`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to load retention report')
      setReport(j as Report)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load retention report')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const runWhatIf = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number.parseInt(days, 10)
    if (days && (!Number.isInteger(n) || n < RETENTION_MIN_DAYS || n > RETENTION_MAX_DAYS)) {
      toast.error(`Days must be between ${RETENTION_MIN_DAYS} and ${RETENTION_MAX_DAYS}`)
      return
    }
    void load(days || undefined)
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/admin/retention', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Retention run failed')
      const failed = (j.lines ?? []).filter((l: { error?: string }) => l.error).length
      toast.success(
        `Retention run complete — ${Number(j.totalDeleted ?? 0).toLocaleString()} rows removed${failed ? `, ${failed} class(es) failed` : ''}`,
        { duration: 10000 },
      )
      setConfirmText('')
      await load(days || undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retention run failed')
    } finally {
      setRunning(false)
    }
  }

  // Group lines by tenant for display.
  const byTenant = new Map<string, { name: string; lines: Line[] }>()
  for (const l of report?.lines ?? []) {
    const g = byTenant.get(l.tenant_id) ?? { name: l.tenant_name, lines: [] }
    g.lines.push(l)
    byTenant.set(l.tenant_id, g)
  }
  const totalWouldRemove = (report?.lines ?? []).reduce((s, l) => s + (l.would_remove ?? 0), 0)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Archive className="h-6 w-6 text-primary" /> Data Retention
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What a retention run would remove, per VAR and data class. Policies are set on each VAR&apos;s page.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-medium">Live deletion.</span> A nightly job (03:00 UTC) permanently
          removes rows older than each VAR&apos;s policy, and <em>Run now</em> below does it immediately.
          A VAR with no policy set keeps everything — that is the default. The counts below are what a
          run would remove right now; every run is recorded in the history at the bottom of this page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What if every VAR kept N days?</CardTitle>
          <CardDescription>
            Leave blank to use each VAR&apos;s own policy. Enter a number to preview a uniform policy without saving it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={runWhatIf} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Days to keep</Label>
              <Input
                type="number" min={RETENTION_MIN_DAYS} max={RETENTION_MAX_DAYS} value={days}
                onChange={(e) => setDays(e.target.value)} placeholder="e.g. 365" className="w-40"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Recalculate
            </Button>
          </form>
        </CardContent>
      </Card>

      {report && report.failures.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">Some counts could not be computed — treat those lines as unknown, not zero.</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {report.failures.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan</CardTitle>
          <CardDescription>
            {report
              ? <>Generated {formatDateTime(report.generated_at)}{report.override_days ? ` · previewing ${report.override_days} days for every VAR` : ' · each VAR’s own policy'} · {totalWouldRemove.toLocaleString()} rows would be removed in total</>
              : 'Loading…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !report ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : byTenant.size === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No VARs found.</p>
          ) : (
            <div className="space-y-6">
              {[...byTenant.entries()].map(([tenantId, g]) => (
                <div key={tenantId}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-medium">{g.name}</h3>
                    <Link href={`/admin/tenants/${tenantId}`} className="text-xs text-primary hover:underline">Edit policy</Link>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Data class</th>
                        <th className="pb-2 pr-4 font-medium">Keep</th>
                        <th className="pb-2 pr-4 font-medium">Older than</th>
                        <th className="pb-2 font-medium text-right">Would remove</th>
                      </tr></thead>
                      <tbody>
                        {g.lines.map((l) => (
                          <tr key={l.key} className="border-b last:border-0">
                            <td className="py-2 pr-4">{l.label}</td>
                            <td className="py-2 pr-4 tabular-nums">{l.days === null ? <span className="text-muted-foreground">forever</span> : `${l.days} days`}</td>
                            <td className="py-2 pr-4 text-muted-foreground">{l.cutoff ? formatDateTime(l.cutoff) : '—'}</td>
                            <td className="py-2 text-right tabular-nums">
                              {l.days === null ? <span className="text-muted-foreground">—</span>
                                : l.would_remove === null ? <span className="text-destructive">unknown</span>
                                : l.would_remove.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-red-300 dark:border-red-900/40">
        <CardHeader>
          <CardTitle className="text-base">Run now</CardTitle>
          <CardDescription>
            Applies every VAR&apos;s policy immediately and permanently, exactly as the nightly job does.
            Type <span className="font-mono font-medium">DELETE</span> to enable the button.
            {totalWouldRemove > 0 && <> About <span className="font-medium">{totalWouldRemove.toLocaleString()}</span> rows would be removed.</>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type DELETE to confirm</Label>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" className="w-40 font-mono" />
            </div>
            <Button variant="destructive" disabled={confirmText !== 'DELETE' || running} onClick={runNow}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Run retention now
            </Button>
          </div>
        </CardContent>
      </Card>

      {report && report.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run history</CardTitle>
            <CardDescription>Last {report.history.length} recorded runs, newest first. Every run is audited, including ones that removed nothing.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">When</th>
                  <th className="pb-2 pr-4 font-medium">Data class</th>
                  <th className="pb-2 pr-4 font-medium">Kept</th>
                  <th className="pb-2 pr-4 font-medium">Trigger</th>
                  <th className="pb-2 font-medium text-right">Removed</th>
                </tr></thead>
                <tbody>
                  {report.history.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">{formatDateTime(r.started_at)}</td>
                      <td className="py-2 pr-4">{r.data_class}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.days_kept} days</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{r.triggered_by === 'cron' ? 'scheduled' : 'manual'}</td>
                      <td className="py-2 text-right tabular-nums">
                        {r.error ? <span className="text-destructive" title={r.error}>failed</span> : r.rows_deleted.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader><CardTitle className="text-base">Data classes</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              {report.targets.map((t) => (
                <div key={t.key}>
                  <dt className="text-sm font-medium">{t.label}</dt>
                  <dd className="text-xs text-muted-foreground">{t.description}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              Orders, customers, invoices, devices and triage results are never retention targets.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
