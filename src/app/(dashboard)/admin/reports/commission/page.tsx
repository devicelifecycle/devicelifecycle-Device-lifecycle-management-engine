'use client'

// ============================================================================
// ADMIN — COMMISSION REPORTING
// ============================================================================
// Projects a VAR's blended-charge breakdown across a deal volume, using the
// VAR's own commission config. Separates every BB charge (platform commission,
// product margin) from the VAR's corp/rep margins — the split the VAR never sees.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { commissionConfigFromSettings, DEFAULT_COMMISSION_CONFIG, type CommissionConfig } from '@/lib/commission'
import { projectVolume, effectiveTakeRate } from '@/lib/commission-report'

interface VarOption { id: string; name: string; type: string }


export default function CommissionReportPageImpl() {
  const [vars, setVars] = useState<VarOption[]>([])
  const [tenantId, setTenantId] = useState('')
  const [config, setConfig] = useState<CommissionConfig>(DEFAULT_COMMISSION_CONFIG)
  const [loading, setLoading] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(false)

  const [tradeInCount, setTradeInCount] = useState('40')
  const [tradeInValue, setTradeInValue] = useState('110')
  const [cpoCount, setCpoCount] = useState('20')
  const [cpoValue, setCpoValue] = useState('1000')

  useEffect(() => {
    fetch('/api/admin/tenants?type=var&limit=200')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setVars((j?.data ?? []).filter((t: VarOption) => t.type === 'var')))
      .catch(() => toast.error('Failed to load VARs'))
      .finally(() => setLoading(false))
  }, [])

  const pickVar = useCallback(async (id: string) => {
    setTenantId(id)
    setLoadingConfig(true)
    try {
      const res = await fetch(`/api/admin/tenants/${id}`)
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setConfig(commissionConfigFromSettings(data.settings))
    } catch {
      toast.error('Failed to load VAR commission config')
      setConfig(DEFAULT_COMMISSION_CONFIG)
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  const summary = useMemo(
    () => projectVolume({
      tradeInCount: Number(tradeInCount) || 0,
      tradeInValue: Number(tradeInValue) || 0,
      cpoCount: Number(cpoCount) || 0,
      cpoValue: Number(cpoValue) || 0,
      config,
    }),
    [tradeInCount, tradeInValue, cpoCount, cpoValue, config],
  )

  const takeRate = effectiveTakeRate(summary)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 className="h-6 w-6 text-primary" /> Commission reporting
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Project Byte-Back&apos;s take across a VAR&apos;s deal volume. The VAR sees only blended prices;
          this separates every charge.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inputs</CardTitle>
          <CardDescription>Pick a VAR and a projected volume.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm space-y-1.5">
            <Label className="text-xs">VAR</Label>
            <Select value={tenantId} onValueChange={pickVar}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? 'Loading…' : 'Select VAR'} />
              </SelectTrigger>
              <SelectContent>
                {vars.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No VARs yet</div>
                ) : vars.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {loadingConfig && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading config…</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <NumField label="Trade-ins" value={tradeInCount} onChange={setTradeInCount} />
            <NumField label="Avg trade-in value" value={tradeInValue} onChange={setTradeInValue} prefix="$" />
            <NumField label="CPO deals" value={cpoCount} onChange={setCpoCount} />
            <NumField label="Avg CPO value" value={cpoValue} onChange={setCpoValue} prefix="$" />
          </div>
          <p className="text-xs text-muted-foreground">
            Applied model — BB commission {pct(config.platformCommissionPct)}, product margin {pct(config.productMarginPct)},
            corp {marginLabel(config, 'corpMargin')}, rep {marginLabel(config, 'repMargin')}.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Byte-Back revenue</CardTitle>
            <CardDescription>{summary.dealCount} deals · effective take {pct(takeRate)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <Line label="Platform commission" value={summary.bbPlatformCommission} strong />
            <Line label="Product margin" value={summary.bbProductMargin} />
            <div className="my-2 border-t" />
            <Line label="Total BB take" value={summary.bbTake} strong accent />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">VAR + volume</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Line label="Gross volume" value={summary.grossVolume} />
            <Line label="Corp margin" value={summary.corpMargin} />
            <Line label="Rep margin" value={summary.repMargin} />
            <Line label="VAR total margin" value={summary.varMargin} strong />
            <div className="my-2 border-t" />
            <Line label="Customer volume" value={summary.customerVolume} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
function marginLabel(c: CommissionConfig, key: 'corpMargin' | 'repMargin') {
  const m = c[key]
  return m.type === 'percent' ? pct(m.value) : formatCurrency(m.value)
}

function NumField({ label, value, onChange, prefix }: { label: string; value: string; onChange: (v: string) => void; prefix?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
        <Input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)} className={prefix ? 'pl-7' : ''} />
      </div>
    </div>
  )
}

function Line({ label, value, strong, accent }: { label: string; value: number; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
      <span className={`tabular-nums ${accent ? 'text-lg font-bold text-primary' : strong ? 'font-semibold' : ''}`}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}
