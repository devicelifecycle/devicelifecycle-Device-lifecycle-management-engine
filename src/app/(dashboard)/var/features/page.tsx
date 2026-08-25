'use client'

// ============================================================================
// VAR PRODUCT CONFIGURATION — feature toggles within the plan ceiling
// ============================================================================
// Lets a VAR Entity Admin switch platform modules on/off for their own org.
// The plan ceiling ("Included"/"Not in plan") is set by BB admin on the tenant
// record and shown read-only here; toggles persist to
// settings.var_feature_overrides via PUT /api/var/features, which rejects any
// attempt to enable above the ceiling. Enforcement lives server-side via
// tenantLimits() (ceiling AND var toggle). Route access is gated by the
// proxy's /var roleRoutes entry, same as the console page.

import { useEffect, useState } from 'react'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { ComingSoon } from '@/components/ComingSoon'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { FeatureKey } from '@/lib/features'

interface FeatureRow {
  key: FeatureKey
  label: string
  description: string
  /** Platform-set availability — shown read-only as Included / Not in plan. */
  ceilingEnabled: boolean
  override: boolean | null
  /** Current VAR-side switch position (override ?? ceiling). */
  varEnabled: boolean
}

const PLAN_BADGE = {
  in: 'inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-300',
  out: 'inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
}

export default function VarFeaturesPage() {
  return <ComingSoon title="VAR Features" />
}

function VarFeaturesPageImpl() {
  const [rows, setRows] = useState<FeatureRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  // Unsaved toggle changes keyed by feature; rows stay as last persisted.
  const [draft, setDraft] = useState<Partial<Record<FeatureKey, boolean>>>({})

  useEffect(() => {
    fetch('/api/var/features')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data?.features) setRows(j.data.features)
        else setLoadFailed(true)
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }, [])

  const valueFor = (r: FeatureRow): boolean => draft[r.key] ?? r.varEnabled

  // Only rows whose draft differs from persisted state are actually dirty.
  const changedKeys = rows.filter((r) => r.key in draft && draft[r.key] !== r.varEnabled).map((r) => r.key)

  const save = async () => {
    if (changedKeys.length === 0) return
    const overrides: Partial<Record<FeatureKey, boolean>> = {}
    for (const k of changedKeys) overrides[k] = draft[k] as boolean
    setSaving(true)
    try {
      const res = await fetch('/api/var/features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) { toast.error(j?.error || 'Could not save feature configuration'); return }
      // Refetch-after-save equivalent: adopt the rows the API persisted.
      setRows(j?.data?.features ?? [])
      setDraft({})
      toast.success('Feature configuration saved')
    } catch {
      toast.error('Could not save feature configuration')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <SlidersHorizontal className="h-6 w-6 text-primary" /> Features
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn platform modules on or off for your organization — within what your plan includes.
        </p>
      </div>

      {loadFailed && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Unable to load your feature configuration.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading features…
        </div>
      ) : !loadFailed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Modules</CardTitle>
            <CardDescription>{rows.length} module{rows.length === 1 ? '' : 's'} in your plan catalog.</CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No features configured yet.</p>
            ) : (
              <div className="divide-y">
                {rows.map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{r.label}</span>
                        <span className={r.ceilingEnabled ? PLAN_BADGE.in : PLAN_BADGE.out}>
                          {r.ceilingEnabled ? 'Included' : 'Not in plan'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Switch
                        checked={valueFor(r)}
                        disabled={!r.ceilingEnabled}
                        onCheckedChange={(checked) => setDraft((d) => ({ ...d, [r.key]: checked }))}
                      />
                      {!r.ceilingEnabled && (
                        <span className="text-[11px] text-muted-foreground">Not available on your plan</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          {rows.length > 0 && (
            <CardContent className="flex justify-end border-t border-border/50">
              <Button type="button" onClick={save} disabled={saving || changedKeys.length === 0}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Save changes{changedKeys.length > 0 ? ` (${changedKeys.length})` : ''}
              </Button>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}