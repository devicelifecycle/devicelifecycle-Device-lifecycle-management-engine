'use client'

// ============================================================================
// ADMIN — COMMISSION & MARGINS
// The "Input tab fields" from the VAR outline: BB platform commission %,
// product margin %, and the VAR's Corp/Rep margins. Live preview shows how the
// rates flow through a trade-in and a CPO deal.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Percent, DollarSign, Loader2, Save } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { computeDealPricing, type CommissionConfig, type MarginSpec } from '@/lib/commission'
import { formatCurrency } from '@/lib/utils'

type MarginType = MarginSpec['type']

const DEFAULT: CommissionConfig = {
  platformCommissionPct: 0.05,
  productMarginPct: 0,
  holdbackPct: 0,
  corpMargin: { type: 'fixed', value: 0 },
  repMargin: { type: 'fixed', value: 0 },
}


export default function CommissionSettingsPageImpl() {
  const [config, setConfig] = useState<CommissionConfig>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/commission')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.config) setConfig(j.config) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/commission', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error()
      toast.success('Commission settings saved')
    } catch {
      toast.error('Failed to save commission settings')
    } finally {
      setSaving(false)
    }
  }

  // Live preview against representative deals
  const preview = useMemo(() => ({
    tradeIn: computeDealPricing({ orderType: 'trade_in', marketValue: 130, config }),
    cpo: computeDealPricing({ orderType: 'cpo', marketValue: 1000, config }),
  }), [config])

  const marginLabel = (m: MarginSpec) => (m.type === 'percent' ? `${(m.value * 100).toFixed(1)}%` : formatCurrency(m.value))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commission &amp; Margins</h1>
        <p className="mt-1 text-muted-foreground">
          Set the platform revenue rates and the VAR&apos;s margin defaults. These blend into the
          price and never appear as separate line items to the VAR.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* ── Config ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Byte-Back revenue</CardTitle>
              <CardDescription>Blended into every deal; reported separately for BB Admin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PercentField
                label="Platform Commission"
                value={config.platformCommissionPct}
                onChange={(v) => setConfig((c) => ({ ...c, platformCommissionPct: v }))}
              />
              <PercentField
                label="Product Margin"
                value={config.productMarginPct}
                onChange={(v) => setConfig((c) => ({ ...c, productMarginPct: v }))}
              />
              <PercentField
                label="Holdback"
                value={config.holdbackPct}
                onChange={(v) => setConfig((c) => ({ ...c, holdbackPct: v }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">VAR margins (defaults)</CardTitle>
              <CardDescription>The VAR&apos;s Corp and Rep cut — deducted on trade-in, added on CPO.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <MarginField
                label="Corp Margin"
                spec={config.corpMargin}
                onChange={(m) => setConfig((c) => ({ ...c, corpMargin: m }))}
              />
              <MarginField
                label="Rep Margin"
                spec={config.repMargin}
                onChange={(m) => setConfig((c) => ({ ...c, repMargin: m }))}
              />
            </CardContent>
          </Card>

          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save settings
          </Button>
        </div>

        {/* ── Live preview ───────────────────────────────────────── */}
        <div className="space-y-6">
          <Card className="bg-muted/40">
            <CardHeader>
              <CardTitle className="text-base">Live preview</CardTitle>
              <CardDescription>How the current rates flow through a deal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <DealPreview
                title="Trade-in"
                sub="Customer sells a device"
                rows={[
                  ['Market value', formatCurrency(preview.tradeIn.marketValue)],
                  [`BB take (${marginLabel({ type: 'percent', value: config.platformCommissionPct + config.productMarginPct + config.holdbackPct })})`, `− ${formatCurrency(preview.tradeIn.bbTake)}`],
                  ['VAR price (BB pays VAR)', formatCurrency(preview.tradeIn.varPrice)],
                  [`Corp ${marginLabel(config.corpMargin)} + Rep ${marginLabel(config.repMargin)}`, `− ${formatCurrency(preview.tradeIn.varMargin)}`],
                ]}
                total={['Customer receives', formatCurrency(preview.tradeIn.customerAmount)]}
              />
              <DealPreview
                title="CPO"
                sub="Customer buys a device"
                rows={[
                  ['Base cost', formatCurrency(preview.cpo.marketValue)],
                  [`BB take`, `+ ${formatCurrency(preview.cpo.bbTake)}`],
                  ['VAR price (VAR pays BB)', formatCurrency(preview.cpo.varPrice)],
                  [`Corp ${marginLabel(config.corpMargin)} + Rep ${marginLabel(config.repMargin)}`, `+ ${formatCurrency(preview.cpo.varMargin)}`],
                ]}
                total={['Customer charged', formatCurrency(preview.cpo.customerAmount)]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={Number((value * 100).toFixed(3))}
          onChange={(e) => onChange(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100)}
          className="pr-9"
        />
        <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  )
}

function MarginField({ label, spec, onChange }: { label: string; spec: MarginSpec; onChange: (m: MarginSpec) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Select value={spec.type} onValueChange={(t) => onChange({ type: t as MarginType, value: spec.value })}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">$ Fixed</SelectItem>
            <SelectItem value="percent">% Percent</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Input
            type="number"
            min={0}
            step={spec.type === 'percent' ? 0.5 : 1}
            value={spec.type === 'percent' ? Number((spec.value * 100).toFixed(3)) : spec.value}
            onChange={(e) => {
              const raw = Math.max(0, parseFloat(e.target.value) || 0)
              onChange({ type: spec.type, value: spec.type === 'percent' ? raw / 100 : raw })
            }}
            className="pr-9"
          />
          {spec.type === 'percent'
            ? <Percent className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            : <DollarSign className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
        </div>
      </div>
    </div>
  )
}

function DealPreview({ title, sub, rows, total }: { title: string; sub: string; rows: [string, string][]; total: [string, string] }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-mono tabular-nums text-foreground">{v}</dd>
          </div>
        ))}
        <div className="mt-2 flex justify-between gap-4 border-t border-border pt-2">
          <dt className="font-semibold text-foreground">{total[0]}</dt>
          <dd className="font-mono font-semibold tabular-nums text-primary">{total[1]}</dd>
        </div>
      </dl>
    </div>
  )
}
