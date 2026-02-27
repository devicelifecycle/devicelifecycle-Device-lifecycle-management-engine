// ============================================================================
// ADMIN - PRICING MANAGEMENT PAGE (V2 Market-Referenced)
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, Search, Plus, Trash2, Pencil, TrendingUp, Calculator, BarChart3, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { CONDITION_CONFIG, STORAGE_OPTIONS, CARRIERS, MARGIN_TIER_CONFIG, COMPETITORS as COMPETITOR_LIST } from '@/lib/constants'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import type { MarketPrice, CompetitorPrice, DeviceCondition, Device, PriceCalculationResultV2 } from '@/types'

const conditions: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']

export default function AdminPricingPage() {
  // Shared state
  const [devices, setDevices] = useState<Device[]>([])
  const [search, setSearch] = useState('')

  // Market prices tab
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([])
  const [mpLoading, setMpLoading] = useState(true)
  const [mpDialogOpen, setMpDialogOpen] = useState(false)
  const [mpSaving, setMpSaving] = useState(false)
  const [mpEditId, setMpEditId] = useState<string | null>(null)
  const [mpDeleteTarget, setMpDeleteTarget] = useState<string | null>(null)
  const [mpForm, setMpForm] = useState({
    device_id: '', storage: '', carrier: 'Unlocked',
    wholesale_b_minus: '', wholesale_c_stock: '',
    marketplace_price: '', marketplace_good: '', marketplace_fair: '',
    trade_price: '', cpo_price: '',
    effective_date: new Date().toISOString().split('T')[0],
    source: 'Manual',
  })

  // Competitor prices tab
  const [compPrices, setCompPrices] = useState<CompetitorPrice[]>([])
  const [cpLoading, setCpLoading] = useState(true)
  const [cpDialogOpen, setCpDialogOpen] = useState(false)
  const [cpSaving, setCpSaving] = useState(false)
  const [cpDeleteTarget, setCpDeleteTarget] = useState<string | null>(null)
  const [cpForm, setCpForm] = useState({
    device_id: '', storage: '', competitor_name: '', trade_in_price: '', sell_price: '',
  })

  // Calculator tab
  const [calcForm, setCalcForm] = useState({
    device_id: '', storage: '', carrier: 'Unlocked', condition: 'good' as DeviceCondition,
    risk_mode: 'retail' as 'retail' | 'enterprise',
  })
  const [calcResult, setCalcResult] = useState<PriceCalculationResultV2 | null>(null)
  const [calculating, setCalculating] = useState(false)

  // Pricing settings tab
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({})
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)

  // Fetch data
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices?page_size=500')
      if (res.ok) { const d = await res.json(); setDevices(d.data || []) }
    } catch {}
  }, [])

  const fetchMarketPrices = useCallback(async () => {
    setMpLoading(true)
    try {
      const res = await fetch('/api/pricing/market')
      if (res.ok) { const d = await res.json(); setMarketPrices(d.data || []) }
    } catch {} finally { setMpLoading(false) }
  }, [])

  const fetchCompetitorPrices = useCallback(async () => {
    setCpLoading(true)
    try {
      const res = await fetch('/api/pricing/competitors')
      if (res.ok) { const d = await res.json(); setCompPrices(d.data || []) }
    } catch {} finally { setCpLoading(false) }
  }, [])

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const res = await fetch('/api/pricing/settings')
      if (res.ok) { const d = await res.json(); setSettingsForm(d.data || {}) }
    } catch {} finally { setSettingsLoading(false) }
  }, [])

  useEffect(() => { fetchDevices(); fetchMarketPrices(); fetchCompetitorPrices(); fetchSettings() }, [fetchDevices, fetchMarketPrices, fetchCompetitorPrices, fetchSettings])

  const deviceMap = new Map(devices.map(d => [d.id, d]))
  const getDeviceLabel = (deviceId: string) => {
    const d = deviceMap.get(deviceId)
    return d ? `${d.make} ${d.model}` : deviceId.slice(0, 8) + '...'
  }

  // Market price margin calculation
  const getMargin = (mp: MarketPrice) => {
    if (!mp.wholesale_c_stock || !mp.trade_price) return null
    return (mp.wholesale_c_stock - mp.trade_price) / mp.wholesale_c_stock
  }

  const getMarginTier = (margin: number | null): 'green' | 'yellow' | 'red' | null => {
    if (margin === null) return null
    if (margin >= 0.30) return 'green'
    if (margin >= 0.20) return 'yellow'
    return 'red'
  }

  // ============================================================================
  // MARKET PRICES HANDLERS
  // ============================================================================

  const handleMpSave = async () => {
    setMpSaving(true)
    try {
      const payload: Record<string, unknown> = {
        device_id: mpForm.device_id,
        storage: mpForm.storage,
        carrier: mpForm.carrier,
        effective_date: mpForm.effective_date,
      }
      if (mpForm.wholesale_b_minus) payload.wholesale_b_minus = parseFloat(mpForm.wholesale_b_minus)
      if (mpForm.wholesale_c_stock) payload.wholesale_c_stock = parseFloat(mpForm.wholesale_c_stock)
      if (mpForm.marketplace_price) payload.marketplace_price = parseFloat(mpForm.marketplace_price)
      if (mpForm.marketplace_good) payload.marketplace_good = parseFloat(mpForm.marketplace_good)
      if (mpForm.marketplace_fair) payload.marketplace_fair = parseFloat(mpForm.marketplace_fair)
      if (mpForm.trade_price) payload.trade_price = parseFloat(mpForm.trade_price)
      if (mpForm.cpo_price) payload.cpo_price = parseFloat(mpForm.cpo_price)
      payload.source = mpForm.source

      const url = mpEditId ? `/api/pricing/market/${mpEditId}` : '/api/pricing/market'
      const method = mpEditId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success(mpEditId ? 'Market price updated' : 'Market price created')
      setMpDialogOpen(false)
      resetMpForm()
      fetchMarketPrices()
    } catch {
      toast.error('Failed to save market price')
    } finally { setMpSaving(false) }
  }

  const handleMpEdit = (mp: MarketPrice) => {
    setMpEditId(mp.id)
    setMpForm({
      device_id: mp.device_id,
      storage: mp.storage,
      carrier: mp.carrier,
      wholesale_b_minus: mp.wholesale_b_minus?.toString() || '',
      wholesale_c_stock: mp.wholesale_c_stock?.toString() || '',
      marketplace_price: mp.marketplace_price?.toString() || '',
      marketplace_good: mp.marketplace_good?.toString() || '',
      marketplace_fair: mp.marketplace_fair?.toString() || '',
      trade_price: mp.trade_price?.toString() || '',
      cpo_price: mp.cpo_price?.toString() || '',
      effective_date: mp.effective_date,
      source: mp.source || 'Manual',
    })
    setMpDialogOpen(true)
  }

  const handleMpDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/pricing/market/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Market price deleted')
      fetchMarketPrices()
    } catch {
      toast.error('Failed to delete')
    } finally { setMpDeleteTarget(null) }
  }

  const resetMpForm = () => {
    setMpEditId(null)
    setMpForm({
      device_id: '', storage: '', carrier: 'Unlocked',
      wholesale_b_minus: '', wholesale_c_stock: '',
      marketplace_price: '', marketplace_good: '', marketplace_fair: '',
      trade_price: '', cpo_price: '',
      effective_date: new Date().toISOString().split('T')[0],
      source: 'Manual',
    })
  }

  // ============================================================================
  // COMPETITOR PRICES HANDLERS
  // ============================================================================

  const handleCpSave = async () => {
    setCpSaving(true)
    try {
      const payload: Record<string, unknown> = {
        device_id: cpForm.device_id,
        storage: cpForm.storage,
        competitor_name: cpForm.competitor_name,
        source: 'manual',
      }
      if (cpForm.trade_in_price) payload.trade_in_price = parseFloat(cpForm.trade_in_price)
      if (cpForm.sell_price) payload.sell_price = parseFloat(cpForm.sell_price)

      const res = await fetch('/api/pricing/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success('Competitor price added')
      setCpDialogOpen(false)
      setCpForm({ device_id: '', storage: '', competitor_name: '', trade_in_price: '', sell_price: '' })
      fetchCompetitorPrices()
    } catch {
      toast.error('Failed to save competitor price')
    } finally { setCpSaving(false) }
  }

  // ============================================================================
  // CALCULATOR
  // ============================================================================

  const handleCalculate = async () => {
    if (!calcForm.device_id || !calcForm.storage) {
      toast.error('Select a device and storage')
      return
    }
    setCalculating(true)
    try {
      const res = await fetch('/api/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 'v2',
          device_id: calcForm.device_id,
          storage: calcForm.storage,
          carrier: calcForm.carrier,
          condition: calcForm.condition,
          risk_mode: calcForm.risk_mode,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCalcResult(data)
    } catch {
      toast.error('Calculation failed')
    } finally { setCalculating(false) }
  }

  const handleSaveSettings = async () => {
    setSettingsSaving(true)
    try {
      const res = await fetch('/api/pricing/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      })
      if (!res.ok) throw new Error()
      toast.success('Pricing settings saved')
    } catch {
      toast.error('Failed to save settings')
    } finally { setSettingsSaving(false) }
  }

  const SETTINGS_FIELDS = [
    { key: 'channel_green_min', label: 'Green Margin Min (%)', desc: 'Min margin for direct wholesale' },
    { key: 'channel_yellow_min', label: 'Yellow Margin Min (%)', desc: 'Min margin for moderate tier' },
    { key: 'marketplace_fee_percent', label: 'Marketplace Fee (%)', desc: 'Fee for MP channel' },
    { key: 'breakage_risk_percent', label: 'Breakage Risk (%)', desc: 'Deduction for breakage' },
    { key: 'competitive_relevance_min', label: 'Competitive Floor', desc: 'Min fraction of top competitor' },
    { key: 'outlier_deviation_threshold', label: 'Outlier Threshold', desc: 'Flag if deviates more than this' },
    { key: 'trade_in_profit_percent', label: 'Trade-In Profit (%)', desc: 'Retail profit target' },
    { key: 'enterprise_margin_percent', label: 'Enterprise Margin (%)', desc: 'Enterprise profit target' },
    { key: 'cpo_markup_percent', label: 'CPO Markup (%)', desc: 'Retail CPO markup' },
    { key: 'cpo_enterprise_markup_percent', label: 'CPO Enterprise Markup (%)', desc: 'Enterprise CPO markup' },
    { key: 'price_staleness_days', label: 'Price Staleness (days)', desc: 'Warn when competitor data older' },
  ] as const

  // Filter market prices
  const filteredMp = marketPrices.filter(mp => {
    if (!search) return true
    const s = search.toLowerCase()
    const label = getDeviceLabel(mp.device_id).toLowerCase()
    return label.includes(s) || mp.storage?.toLowerCase().includes(s)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pricing Engine</h1>
          <p className="text-muted-foreground">Market-referenced competitive pricing management</p>
        </div>
      </div>

      <Tabs defaultValue="market">
        <TabsList>
          <TabsTrigger value="market"><DollarSign className="mr-1.5 h-3.5 w-3.5" />Market Prices</TabsTrigger>
          <TabsTrigger value="competitors"><TrendingUp className="mr-1.5 h-3.5 w-3.5" />Competitors</TabsTrigger>
          <TabsTrigger value="calculator"><Calculator className="mr-1.5 h-3.5 w-3.5" />Price Calculator</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="mr-1.5 h-3.5 w-3.5" />Settings</TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* TAB 1: MARKET PRICES */}
        {/* ============================================================ */}
        <TabsContent value="market" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search devices..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={() => { resetMpForm(); setMpDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />Add Market Price
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Market Reference Prices ({filteredMp.length})</CardTitle>
              <CardDescription>Wholesale, marketplace, and trade-in prices per device SKU</CardDescription>
            </CardHeader>
            <CardContent>
              {mpLoading ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              ) : filteredMp.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <BarChart3 className="h-10 w-10 mb-3 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No market prices yet</p>
                  <p className="text-xs mt-1">Add market reference prices from the company&apos;s pricing spreadsheet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device</TableHead>
                        <TableHead>Storage</TableHead>
                        <TableHead className="text-right">C Stock</TableHead>
                        <TableHead className="text-right">B-</TableHead>
                        <TableHead className="text-right">Trade</TableHead>
                        <TableHead className="text-right">CPO</TableHead>
                        <TableHead className="text-right">MP Price</TableHead>
                        <TableHead>Margin</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMp.map(mp => {
                        const margin = getMargin(mp)
                        const tier = getMarginTier(margin)
                        const tierConfig = tier ? MARGIN_TIER_CONFIG[tier] : null
                        return (
                          <TableRow key={mp.id}>
                            <TableCell className="font-medium">{getDeviceLabel(mp.device_id)}</TableCell>
                            <TableCell>{mp.storage}</TableCell>
                            <TableCell className="text-right font-mono">{mp.wholesale_c_stock ? formatCurrency(mp.wholesale_c_stock) : '—'}</TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">{mp.wholesale_b_minus ? formatCurrency(mp.wholesale_b_minus) : '—'}</TableCell>
                            <TableCell className="text-right font-mono font-medium">{mp.trade_price ? formatCurrency(mp.trade_price) : '—'}</TableCell>
                            <TableCell className="text-right font-mono">{mp.cpo_price ? formatCurrency(mp.cpo_price) : '—'}</TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">{mp.marketplace_price ? formatCurrency(mp.marketplace_price) : '—'}</TableCell>
                            <TableCell>
                              {tierConfig && margin !== null ? (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tierConfig.bgColor} ${tierConfig.color}`}>
                                  {Math.round(margin * 100)}% {tierConfig.label}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => handleMpEdit(mp)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setMpDeleteTarget(mp.id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 2: COMPETITOR PRICES */}
        {/* ============================================================ */}
        <TabsContent value="competitors" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Track competitor trade-in and resale offers for competitive positioning</p>
            <Button onClick={() => setCpDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Add Competitor Price
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competitor Price Tracking</CardTitle>
              <CardDescription>Compare your trade-in offers against Telus, Bell, and other competitors</CardDescription>
            </CardHeader>
            <CardContent>
              {cpLoading ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              ) : compPrices.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <TrendingUp className="h-10 w-10 mb-3 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No competitor prices tracked</p>
                  <p className="text-xs mt-1">Add competitor trade-in offers to compare against your pricing.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead>Competitor</TableHead>
                      <TableHead className="text-right">Trade-In Price</TableHead>
                      <TableHead className="text-right">Sell Price</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compPrices.map(cp => {
                      const updatedAt = cp.updated_at || cp.scraped_at || cp.created_at
                      const daysAgo = updatedAt ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000)) : null
                      const isStale = daysAgo != null && daysAgo > 7
                      return (
                        <TableRow key={cp.id} className={isStale ? 'bg-amber-500/5' : undefined}>
                          <TableCell className="font-medium">{getDeviceLabel(cp.device_id)}</TableCell>
                          <TableCell>{cp.storage}</TableCell>
                          <TableCell><Badge variant="outline">{cp.competitor_name}</Badge></TableCell>
                          <TableCell className="text-right font-mono">{cp.trade_in_price ? formatCurrency(cp.trade_in_price) : '—'}</TableCell>
                          <TableCell className="text-right font-mono">{cp.sell_price ? formatCurrency(cp.sell_price) : '—'}</TableCell>
                          <TableCell><span className="text-xs text-muted-foreground capitalize">{cp.source}</span></TableCell>
                          <TableCell>
                            {daysAgo != null ? (
                              <Badge variant={isStale ? 'destructive' : 'secondary'} className="text-xs">
                                {daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => setCpDeleteTarget(cp.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 3: PRICE CALCULATOR */}
        {/* ============================================================ */}
        <TabsContent value="calculator" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price Calculator</CardTitle>
              <CardDescription>Calculate trade-in and CPO prices with channel routing recommendation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Device</Label>
                  <Select value={calcForm.device_id} onValueChange={v => setCalcForm(f => ({ ...f, device_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                    <SelectContent>
                      {devices.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.make} {d.model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Storage</Label>
                  <Select value={calcForm.storage} onValueChange={v => setCalcForm(f => ({ ...f, storage: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {STORAGE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select value={calcForm.condition} onValueChange={v => setCalcForm(f => ({ ...f, condition: v as DeviceCondition }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {conditions.map(c => <SelectItem key={c} value={c}>{CONDITION_CONFIG[c].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Risk Mode</Label>
                  <Select value={calcForm.risk_mode} onValueChange={v => setCalcForm(f => ({ ...f, risk_mode: v as 'retail' | 'enterprise' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retail">Retail (20% margin)</SelectItem>
                      <SelectItem value="enterprise">Enterprise (12% margin)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleCalculate} disabled={calculating} className="w-full">
                    <Calculator className="mr-2 h-4 w-4" />
                    {calculating ? 'Calculating...' : 'Calculate'}
                  </Button>
                </div>
              </div>

              {calcResult && (
                <div className="mt-6 space-y-4">
                  {!calcResult.success ? (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                      <p className="text-sm text-destructive">{calcResult.error}</p>
                    </div>
                  ) : (
                    <>
                      {calcResult.data_staleness_warning && (
                        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                          {calcResult.data_staleness_warning}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {calcResult.price_expires_at && (
                          <span>Quote valid until {formatDateTime(calcResult.price_expires_at)}</span>
                        )}
                        {calcResult.competitor_data_age_days != null && (
                          <span>Competitor data: {calcResult.competitor_data_age_days} days old</span>
                        )}
                      </div>
                      {/* Prices & Channel */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="rounded-xl border p-5">
                          <p className="text-sm text-muted-foreground">Trade-In Price</p>
                          <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(calcResult.trade_price)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">What we offer the customer</p>
                        </div>
                        <div className="rounded-xl border p-5">
                          <p className="text-sm text-muted-foreground">CPO Price</p>
                          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(calcResult.cpo_price)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">What we sell certified for</p>
                        </div>
                        <div className="rounded-xl border p-5">
                          <p className="text-sm text-muted-foreground">Channel Recommendation</p>
                          {(() => {
                            const tier = calcResult.channel_decision.margin_tier
                            const config = MARGIN_TIER_CONFIG[tier]
                            return (
                              <>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-sm font-semibold ${config.bgColor} ${config.color}`}>
                                    {Math.round(calcResult.channel_decision.margin_percent * 100)}%
                                  </span>
                                  <span className="font-bold capitalize">{calcResult.channel_decision.recommended_channel}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
                              </>
                            )
                          })()}
                        </div>
                      </div>

                      {/* Breakdown */}
                      <div className="grid grid-cols-2 gap-4">
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Price Breakdown</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Anchor (C Stock)</span>
                              <span className="font-mono">{formatCurrency(calcResult.breakdown.anchor_price)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Condition Adj.</span>
                              <span className="font-mono text-red-600">-{formatCurrency(calcResult.breakdown.condition_adjustment)}</span>
                            </div>
                            {calcResult.breakdown.deductions > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Deductions</span>
                                <span className="font-mono text-red-600">-{formatCurrency(calcResult.breakdown.deductions)}</span>
                              </div>
                            )}
                            {calcResult.breakdown.breakage_deduction > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Breakage Risk (5%)</span>
                                <span className="font-mono text-red-600">-{formatCurrency(calcResult.breakdown.breakage_deduction)}</span>
                              </div>
                            )}
                            <div className="flex justify-between border-t pt-2 font-medium">
                              <span>Trade Price</span>
                              <span className="font-mono">{formatCurrency(calcResult.breakdown.final_trade_price)}</span>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Market Context</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            {calcResult.marketplace_price && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">MP Listed Price</span>
                                <span className="font-mono">{formatCurrency(calcResult.marketplace_price)}</span>
                              </div>
                            )}
                            {calcResult.marketplace_net && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">MP Net (after 12%)</span>
                                <span className="font-mono">{formatCurrency(calcResult.marketplace_net)}</span>
                              </div>
                            )}
                            {calcResult.repair_buffer != null && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Repair Buffer</span>
                                <span className={`font-mono ${calcResult.repair_buffer > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(calcResult.repair_buffer)}
                                </span>
                              </div>
                            )}
                            {calcResult.competitors.length > 0 && (
                              <div className="border-t pt-2 space-y-1">
                                <p className="font-medium text-xs text-muted-foreground uppercase">Competitors</p>
                                {calcResult.competitors.map(c => (
                                  <div key={c.name} className="flex justify-between">
                                    <span className="text-muted-foreground">{c.name}</span>
                                    <span className="font-mono">{formatCurrency(c.price)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {calcResult.suggested_repairs && calcResult.suggested_repairs.length > 0 && (
                              <div className="border-t pt-2 space-y-1">
                                <p className="font-medium text-xs text-muted-foreground uppercase">Viable Repairs</p>
                                {calcResult.suggested_repairs.map(r => (
                                  <div key={r.type} className="flex justify-between">
                                    <span className="text-muted-foreground capitalize">{r.type.replace(/_/g, ' ')}</span>
                                    <span className="font-mono">{formatCurrency(r.cost)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      {/* D-Grade Formula */}
                      {calcResult.d_grade_formula && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm">D-Grade Formula (Reverse from MP)</CardTitle>
                            <CardDescription className="text-xs">MP Price - Fees - Margin - Repairs - Breakage = Trade Price</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Selling Price (MP)</span>
                              <span className="font-mono">{formatCurrency(calcResult.d_grade_formula.selling_price)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">MP Fees (12%)</span>
                              <span className="font-mono text-red-600">-{formatCurrency(calcResult.d_grade_formula.marketplace_fees)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Margin ({calcResult.risk_mode === 'enterprise' ? '12' : '20'}%)</span>
                              <span className="font-mono text-red-600">-{formatCurrency(calcResult.d_grade_formula.margin_deduction)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Est. Repairs</span>
                              <span className="font-mono text-red-600">-{formatCurrency(calcResult.d_grade_formula.estimated_repairs)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Breakage Risk (5%)</span>
                              <span className="font-mono text-red-600">-{formatCurrency(calcResult.d_grade_formula.breakage_risk)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 font-medium">
                              <span>D-Grade Trade Price</span>
                              <span className="font-mono">{formatCurrency(calcResult.d_grade_formula.calculated_trade_price)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Outlier Warning */}
                      {calcResult.outlier_flag && (
                        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
                          <p className="text-sm font-medium text-yellow-800">Outlier Detected</p>
                          <p className="text-xs text-yellow-700 mt-1">{calcResult.outlier_reason}</p>
                        </div>
                      )}

                      {/* Confidence & Meta */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                        <span>Confidence:</span>
                        <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${calcResult.confidence * 100}%` }} />
                        </div>
                        <span>{Math.round(calcResult.confidence * 100)}%</span>
                        <span className="text-xs ml-2">Valid for {calcResult.valid_for_hours}h</span>
                        {calcResult.price_source && (
                          <Badge variant="outline" className="ml-2 text-xs">{calcResult.price_source}</Badge>
                        )}
                        <Badge variant="outline" className="text-xs capitalize">{calcResult.risk_mode}</Badge>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 4: PRICING SETTINGS */}
        {/* ============================================================ */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Pricing Engine Settings</CardTitle>
                  <CardDescription>Configure thresholds, margins, and staleness. Changes apply to new price calculations.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const res = await fetch('/api/pricing/train', { method: 'POST' })
                    const d = await res.json()
                    if (res.ok) toast.success(`Training complete: ${d.baselines_upserted ?? 0} baselines, ${d.sample_counts?.order_items ?? 0}+${d.sample_counts?.imei_records ?? 0}+${d.sample_counts?.sales_history ?? 0} samples`)
                    else toast.error(d.error || 'Training failed')
                  } catch { toast.error('Training failed') }
                }}>
                  Train Model
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <Label htmlFor="prefer-data-driven" className="text-sm font-medium">Prefer Data-Driven Model</Label>
                      <p className="text-xs text-muted-foreground mt-1">Use our trained pricing model (from orders, IMEI, sales) instead of market/competitor data. Reduces third-party dependency.</p>
                    </div>
                    <Switch
                      id="prefer-data-driven"
                      checked={settingsForm.prefer_data_driven === 'true'}
                      onCheckedChange={v => setSettingsForm(prev => ({ ...prev, prefer_data_driven: v ? 'true' : 'false' }))}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                  {SETTINGS_FIELDS.map(f => (
                    <div key={f.key} className="space-y-1">
                      <Label htmlFor={`setting-${f.key}`} className="text-sm">{f.label}</Label>
                      <Input
                        id={`setting-${f.key}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={settingsForm[f.key] ?? ''}
                        onChange={e => setSettingsForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder="—"
                      />
                      <p className="text-xs text-muted-foreground">{f.desc}</p>
                    </div>
                  ))}
                  </div>
                </div>
              )}
              {!settingsLoading && (
                <Button className="mt-6" onClick={handleSaveSettings} disabled={settingsSaving}>
                  {settingsSaving ? 'Saving...' : 'Save Settings'}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============================================================ */}
      {/* DIALOGS */}
      {/* ============================================================ */}

      {/* Market Price Add/Edit Dialog */}
      <Dialog open={mpDialogOpen} onOpenChange={(open) => { if (!open) { setMpDialogOpen(false); resetMpForm() } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mpEditId ? 'Edit' : 'Add'} Market Price</DialogTitle>
            <DialogDescription>Enter wholesale, marketplace, and company trade/CPO prices</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Device</Label>
                <Select value={mpForm.device_id} onValueChange={v => setMpForm(f => ({ ...f, device_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {devices.map(d => <SelectItem key={d.id} value={d.id}>{d.make} {d.model}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Storage</Label>
                <Select value={mpForm.storage} onValueChange={v => setMpForm(f => ({ ...f, storage: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {STORAGE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Effective Date</Label>
                <Input type="date" value={mpForm.effective_date} onChange={e => setMpForm(f => ({ ...f, effective_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Price Source</Label>
                <Select value={mpForm.source} onValueChange={v => setMpForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Go Recell">Go Recell</SelectItem>
                    <SelectItem value="Sell By">Sell By</SelectItem>
                    <SelectItem value="Apple Trade-in">Apple Trade-in</SelectItem>
                    <SelectItem value="Manual">Manual</SelectItem>
                    <SelectItem value="Spreadsheet">Spreadsheet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Wholesale C Stock ($)</Label>
                <Input type="number" placeholder="Anchor price" value={mpForm.wholesale_c_stock} onChange={e => setMpForm(f => ({ ...f, wholesale_c_stock: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Wholesale B- ($)</Label>
                <Input type="number" placeholder="B-minus grade" value={mpForm.wholesale_b_minus} onChange={e => setMpForm(f => ({ ...f, wholesale_b_minus: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trade-In Price ($)</Label>
                <Input type="number" placeholder="Our offer to customer" value={mpForm.trade_price} onChange={e => setMpForm(f => ({ ...f, trade_price: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>CPO Price ($)</Label>
                <Input type="number" placeholder="Our certified sell price" value={mpForm.cpo_price} onChange={e => setMpForm(f => ({ ...f, cpo_price: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>MP Price ($)</Label>
                <Input type="number" placeholder="Marketplace listing" value={mpForm.marketplace_price} onChange={e => setMpForm(f => ({ ...f, marketplace_price: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>MP Good ($)</Label>
                <Input type="number" placeholder="Good condition" value={mpForm.marketplace_good} onChange={e => setMpForm(f => ({ ...f, marketplace_good: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>MP Fair ($)</Label>
                <Input type="number" placeholder="Fair condition" value={mpForm.marketplace_fair} onChange={e => setMpForm(f => ({ ...f, marketplace_fair: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMpDialogOpen(false); resetMpForm() }}>Cancel</Button>
            <Button onClick={handleMpSave} disabled={mpSaving || !mpForm.device_id || !mpForm.storage}>
              {mpSaving ? 'Saving...' : (mpEditId ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Competitor Price Dialog */}
      <Dialog open={cpDialogOpen} onOpenChange={setCpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Competitor Price</DialogTitle>
            <DialogDescription>Track a competitor&apos;s trade-in or resale offer</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Device</Label>
                <Select value={cpForm.device_id} onValueChange={v => setCpForm(f => ({ ...f, device_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {devices.map(d => <SelectItem key={d.id} value={d.id}>{d.make} {d.model}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Storage</Label>
                <Select value={cpForm.storage} onValueChange={v => setCpForm(f => ({ ...f, storage: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {STORAGE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Competitor</Label>
              <Select value={cpForm.competitor_name} onValueChange={v => setCpForm(f => ({ ...f, competitor_name: v }))}>
                <SelectTrigger><SelectValue placeholder="Select competitor" /></SelectTrigger>
                <SelectContent>
                  {COMPETITOR_LIST.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trade-In Price ($)</Label>
                <Input type="number" value={cpForm.trade_in_price} onChange={e => setCpForm(f => ({ ...f, trade_in_price: e.target.value }))} placeholder="What they offer" />
              </div>
              <div className="space-y-2">
                <Label>Sell Price ($)</Label>
                <Input type="number" value={cpForm.sell_price} onChange={e => setCpForm(f => ({ ...f, sell_price: e.target.value }))} placeholder="What they sell for" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCpDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCpSave} disabled={cpSaving || !cpForm.device_id || !cpForm.competitor_name}>
              {cpSaving ? 'Saving...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Market Price Confirmation */}
      <AlertDialog open={!!mpDeleteTarget} onOpenChange={(open) => { if (!open) setMpDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Market Price</AlertDialogTitle>
            <AlertDialogDescription>This will remove this market price entry. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => mpDeleteTarget && handleMpDelete(mpDeleteTarget)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
