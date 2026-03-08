// ============================================================================
// ADMIN - PRICING MANAGEMENT PAGE (Competitor-Driven)
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, Trash2, TrendingUp, Calculator, Settings, RefreshCw, FileDown, Activity } from 'lucide-react'
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
import { CONDITION_CONFIG, STORAGE_OPTIONS, MARGIN_TIER_CONFIG, COMPETITORS as COMPETITOR_LIST } from '@/lib/constants'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { CompetitorPrice, DeviceCondition, Device, PriceCalculationResultV2 } from '@/types'

const conditions: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']

function mapCalculatorConditionToCompetitorCondition(condition: DeviceCondition): 'excellent' | 'good' | 'fair' | 'broken' {
  if (condition === 'new' || condition === 'excellent') return 'excellent'
  if (condition === 'fair') return 'fair'
  if (condition === 'poor') return 'broken'
  return 'good'
}

function normalizeCompetitorName(name?: string): string {
  const normalized = (name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalized === 'goresell' || normalized === 'go recell' || normalized === 'gorecell' || normalized === 'go resell') return 'GoRecell'
  if (normalized === 'telus') return 'Telus'
  if (normalized === 'bell') return 'Bell'
  if (normalized === 'universal' || normalized === 'universalcell' || normalized === 'univercell') return 'UniverCell'
  return name || 'Unknown'
}

function normalizeStorageOption(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

function isEnterpriseStorageOption(value: string): boolean {
  return /^(\d+)(GB|TB)$/.test(normalizeStorageOption(value))
}

function getStorageOptionsForDevice(device?: Device): string[] {
  if (!device) return []

  const specs = (device.specifications || {}) as { storage_options?: string[] }
  const fromSpecs = (specs.storage_options || [])
    .filter(Boolean)
    .map(normalizeStorageOption)
    .filter(isEnterpriseStorageOption)

  const uniqueFromSpecs = Array.from(new Set(fromSpecs))
  if (uniqueFromSpecs.length > 0) {
    return uniqueFromSpecs
  }

  return STORAGE_OPTIONS
    .map(normalizeStorageOption)
    .filter(isEnterpriseStorageOption)
}

export default function AdminPricingPage() {
  // Shared state
  const [devices, setDevices] = useState<Device[]>([])

  // Competitor prices tab
  const [compPrices, setCompPrices] = useState<CompetitorPrice[]>([])
  const [cpLoading, setCpLoading] = useState(true)
  const [cpDialogOpen, setCpDialogOpen] = useState(false)
  const [cpSaving, setCpSaving] = useState(false)
  const [cpScraping, setCpScraping] = useState(false)
  const [cpDeleteTarget, setCpDeleteTarget] = useState<string | null>(null)
  const [compSearch, setCompSearch] = useState('')
  const [compConditionFilter, setCompConditionFilter] = useState<'all' | 'excellent' | 'good' | 'fair' | 'broken'>('all')
  const [cpForm, setCpForm] = useState({
    device_id: '', storage: '', competitor_name: '', condition: 'good' as 'excellent' | 'good' | 'fair' | 'broken', trade_in_price: '', sell_price: '',
  })
  const [cpDeviceSearch, setCpDeviceSearch] = useState('')

  // Trade-in / CPO controls
  const [priceMode, setPriceMode] = useState<'trade_in' | 'cpo'>('trade_in')
  const [benchmarkApplying, setBenchmarkApplying] = useState(false)
  const [benchmark, setBenchmark] = useState({
    condition: 'good' as 'excellent' | 'good' | 'fair' | 'broken',
    adjustment_type: 'percent' as 'percent' | 'fixed',
    direction: 'increase' as 'increase' | 'decrease',
    value: '',
  })
  const [benchmarkPreview, setBenchmarkPreview] = useState<Array<{
    device_id: string; device_label: string; storage: string; condition: string;
    current_price: number; proposed_price: number;
  }>>([])
  const [benchmarkPreviewOpen, setBenchmarkPreviewOpen] = useState(false)

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
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  // Training state
  const [trainingInProgress, setTrainingInProgress] = useState(false)
  const [trainingResult, setTrainingResult] = useState<{
    success: boolean
    baselines_upserted: number
    condition_multipliers_updated: boolean
    sample_counts: { order_items: number; imei_records: number; sales_history: number; market_prices: number; competitor_prices: number }
    errors: string[]
    timestamp: string
    duration_ms: number
  } | null>(null)

  const SETTINGS_DEFAULTS: Record<string, string> = {
    trade_in_profit_percent: '20',
    enterprise_margin_percent: '12',
    breakage_risk_percent: '5',
    competitive_relevance_min: '0.85',
    competitor_ceiling_percent: '2',
    price_staleness_days: '7',
    channel_green_min: '0.30',
    channel_yellow_min: '0.20',
    outlier_deviation_threshold: '0.20',
    cpo_markup_percent: '25',
    cpo_enterprise_markup_percent: '18',
    margin_mode: 'auto',
    custom_margin_percent: '0',
    custom_margin_amount: '0',
    prefer_data_driven: 'false',
  }

  // Fetch data
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices?page_size=500')
      if (res.ok) { const d = await res.json(); setDevices(d.data || []) }
    } catch {}
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
      if (res.ok) {
        const d = await res.json()
        setSettingsForm({ ...SETTINGS_DEFAULTS, ...(d.data || {}) })
      }
    } catch {} finally { setSettingsLoading(false) }
  }, [])

  useEffect(() => { fetchDevices(); fetchCompetitorPrices(); fetchSettings() }, [fetchDevices, fetchCompetitorPrices, fetchSettings])

  const deviceMap = new Map(devices.map(d => [d.id, d]))
  const getDeviceLabel = (deviceId: string) => {
    const d = deviceMap.get(deviceId)
    return d ? `${d.make} ${d.model}` : deviceId.slice(0, 8) + '...'
  }

  const selectedCalcDevice = deviceMap.get(calcForm.device_id)
  const calcStorageOptions = getStorageOptionsForDevice(selectedCalcDevice)
  const filteredCpDevices = (() => {
    const query = cpDeviceSearch.trim().toLowerCase()
    if (!query) return devices
    return devices.filter((device) => `${device.make} ${device.model}`.toLowerCase().includes(query))
  })()

  // ============================================================================
  // COMPETITOR PRICES HANDLERS
  // ============================================================================

  const handleCpSave = async () => {
    const normalizedSearch = cpDeviceSearch.trim().toLowerCase()
    let resolvedDeviceId = cpForm.device_id

    if (!resolvedDeviceId && normalizedSearch) {
      const exact = devices.find((device) => `${device.make} ${device.model}`.toLowerCase() === normalizedSearch)
      const partial = exact || devices.find((device) => `${device.make} ${device.model}`.toLowerCase().includes(normalizedSearch))
      if (partial) {
        resolvedDeviceId = partial.id
      }
    }

    if (!resolvedDeviceId) {
      toast.error('Type and select a valid device name')
      return
    }

    setCpSaving(true)
    try {
      const payload: Record<string, unknown> = {
        device_id: resolvedDeviceId,
        storage: cpForm.storage,
        competitor_name: cpForm.competitor_name,
        condition: cpForm.condition,
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
      setCpForm({ device_id: '', storage: '', competitor_name: '', condition: 'good', trade_in_price: '', sell_price: '' })
      setCpDeviceSearch('')
      fetchCompetitorPrices()
    } catch {
      toast.error('Failed to save competitor price')
    } finally { setCpSaving(false) }
  }

  const handleCpDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/pricing/competitors/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Competitor price deleted')
      fetchCompetitorPrices()
    } catch {
      toast.error('Failed to delete')
    } finally { setCpDeleteTarget(null) }
  }

  const handleRunScraper = async () => {
    setCpScraping(true)
    try {
      const res = await fetch('/api/pricing/scrape', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scraper failed')
      toast.success(`Scraper complete: ${data.total_upserted} prices updated${data.devices_created ? `, ${data.devices_created} new devices` : ''}`)
      if (data.errors?.length) {
        toast.warning(`${data.errors.length} warning(s) - check console`)
        console.warn('Scraper warnings:', data.errors)
      }
      fetchCompetitorPrices()
      fetchDevices()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scraper failed')
    } finally { setCpScraping(false) }
  }

  const handleExportCompetitors = async (format: 'pdf' | 'excel') => {
    try {
      const params = new URLSearchParams()
      params.set('format', format)
      if (compSearch) params.set('search', compSearch)
      if (compConditionFilter !== 'all') params.set('condition', compConditionFilter)

      const res = await fetch(`/api/pricing/competitors/export?${params.toString()}`)
      if (!res.ok) throw new Error('Export failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = format === 'pdf' ? 'competitor-prices.pdf' : 'competitor-prices.xls'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(`${format.toUpperCase()} export ready`)
    } catch {
      toast.error('Failed to export competitor prices')
    }
  }

  // ============================================================================
  // BENCHMARK
  // ============================================================================

  const handlePreviewBenchmark = () => {
    const value = Number(benchmark.value)
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Enter a valid benchmark adjustment value')
      return
    }

    const preview: typeof benchmarkPreview = []

    for (const row of competitorMatrixRows) {
      if (row.condition !== benchmark.condition) continue

      const priceSource = priceMode === 'trade_in' ? row.prices : row.sellPrices
      const referenceValues = COMPETITOR_LIST
        .map((competitor) => priceSource[competitor])
        .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0)

      if (referenceValues.length === 0) continue

      const referencePrice = referenceValues.reduce((sum, price) => sum + price, 0) / referenceValues.length

      const delta = benchmark.adjustment_type === 'percent'
        ? (referencePrice * value) / 100
        : value

      const proposed = benchmark.direction === 'increase'
        ? referencePrice + delta
        : Math.max(referencePrice - delta, 0)

      preview.push({
        device_id: row.device_id,
        device_label: getDeviceLabel(row.device_id),
        storage: row.storage,
        condition: row.condition,
        current_price: Number(referencePrice.toFixed(2)),
        proposed_price: Number(proposed.toFixed(2)),
      })
    }

    if (preview.length === 0) {
      toast.error('No matching prices found for the selected condition')
      return
    }

    setBenchmarkPreview(preview)
    setBenchmarkPreviewOpen(true)
  }

  const handleApplyBenchmark = async () => {
    setBenchmarkApplying(true)
    let applied = 0
    let failed = 0

    try {
      for (const item of benchmarkPreview) {
        const payload: Record<string, unknown> = {
          device_id: item.device_id,
          storage: item.storage,
          competitor_name: 'Our Price',
          condition: item.condition,
          source: 'manual',
        }

        if (priceMode === 'trade_in') {
          payload.trade_in_price = item.proposed_price
        } else {
          payload.sell_price = item.proposed_price
        }

        try {
          const res = await fetch('/api/pricing/competitors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (res.ok) applied++
          else failed++
        } catch {
          failed++
        }
      }

      toast.success(`Benchmark applied: ${applied} prices set${failed > 0 ? `, ${failed} failed` : ''}`)
      setBenchmarkPreviewOpen(false)
      setBenchmarkPreview([])
      fetchCompetitorPrices()
    } catch {
      toast.error('Failed to apply benchmark pricing')
    } finally {
      setBenchmarkApplying(false)
    }
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

  const CORE_SETTINGS_FIELDS = [
    { key: 'trade_in_profit_percent', label: 'Target Margin (Retail %)', desc: 'Default profit target for retail quotes.' },
    { key: 'enterprise_margin_percent', label: 'Target Margin (Enterprise %)', desc: 'Default profit target for enterprise quotes.' },
    { key: 'breakage_risk_percent', label: 'Safety Deduction (%)', desc: 'Extra deduction to cover unexpected device issues.' },
    { key: 'competitive_relevance_min', label: 'Minimum Competitiveness', desc: 'How close we stay to competitor offers (0.85 = 85%).' },
    { key: 'competitor_ceiling_percent', label: 'Max Above Competitor (%)', desc: 'Maximum percent we allow above top competitor offer.' },
    { key: 'price_staleness_days', label: 'Price Refresh Reminder (days)', desc: 'Warn admins when competitor data is old.' },
  ] as const

  const ADVANCED_SETTINGS_FIELDS = [
    { key: 'channel_green_min', label: 'Auto Route: Strong Margin Threshold', desc: 'Above this, route to direct wholesale.' },
    { key: 'channel_yellow_min', label: 'Auto Route: Medium Margin Threshold', desc: 'Between medium and strong, use mixed routing logic.' },
    { key: 'outlier_deviation_threshold', label: 'Outlier Alert Threshold', desc: 'Flag quotes that deviate from recent sales by this ratio.' },
    { key: 'cpo_markup_percent', label: 'CPO Markup (Retail %)', desc: 'Markup added to C-stock for retail CPO price.' },
    { key: 'cpo_enterprise_markup_percent', label: 'CPO Markup (Enterprise %)', desc: 'Markup added to C-stock for enterprise CPO price.' },
  ] as const

  // Filter competitor prices
  const filteredComp = compPrices.filter(cp => {
    const matchesCondition = compConditionFilter === 'all' || (cp.condition || 'good') === compConditionFilter
    if (!matchesCondition) return false

    if (!compSearch) return true
    const s = compSearch.toLowerCase()
    const label = getDeviceLabel(cp.device_id).toLowerCase()
    return (
      label.includes(s) ||
      cp.storage?.toLowerCase().includes(s) ||
      cp.competitor_name?.toLowerCase().includes(s)
    )
  })

  // Calculator competitor snapshot
  const calculatorCompetitorSnapshot = (() => {
    if (!calcForm.device_id || !calcForm.storage) {
      return {
        rows: COMPETITOR_LIST.map(name => ({
          name,
          price: undefined,
          sellPrice: undefined as number | undefined,
          retrieved_at: undefined,
          source_condition: undefined as ('excellent' | 'good' | 'fair' | 'broken' | undefined),
        })),
        condition: mapCalculatorConditionToCompetitorCondition(calcForm.condition),
        usedConditionFallback: false,
        highestPrice: undefined as number | undefined,
        averagePrice: undefined as number | undefined,
        averageSellPrice: undefined as number | undefined,
        highestSellPrice: undefined as number | undefined,
        latestRetrievedAt: undefined as string | undefined,
      }
    }

    const condition = mapCalculatorConditionToCompetitorCondition(calcForm.condition)
    const selectedStorage = normalizeStorageOption(calcForm.storage)
    const sameDeviceAndStorage = compPrices.filter(cp => (
      cp.device_id === calcForm.device_id && normalizeStorageOption(cp.storage || '') === selectedStorage
    ))

    if (sameDeviceAndStorage.length === 0) {
      return {
        rows: COMPETITOR_LIST.map(name => ({
          name,
          price: undefined,
          sellPrice: undefined as number | undefined,
          retrieved_at: undefined,
          source_condition: undefined as ('excellent' | 'good' | 'fair' | 'broken' | undefined),
        })),
        condition,
        usedConditionFallback: false,
        highestPrice: undefined as number | undefined,
        averagePrice: undefined as number | undefined,
        averageSellPrice: undefined as number | undefined,
        highestSellPrice: undefined as number | undefined,
        latestRetrievedAt: undefined as string | undefined,
      }
    }

    const canonicalRows = sameDeviceAndStorage.map(cp => ({
      ...cp,
      canonical_name: normalizeCompetitorName(cp.competitor_name),
      canonical_condition: (cp.condition || 'good') as 'excellent' | 'good' | 'fair' | 'broken',
      retrieval_ts: cp.retrieved_at || cp.scraped_at || cp.updated_at || cp.created_at,
    }))

    const pickLatest = (rows: typeof canonicalRows): (typeof canonicalRows)[number] | undefined => {
      if (rows.length === 0) return undefined
      return rows.reduce((latest, current) => {
        if (!latest) return current
        if (!latest.retrieval_ts) return current
        if (!current.retrieval_ts) return latest
        return new Date(current.retrieval_ts).getTime() >= new Date(latest.retrieval_ts).getTime() ? current : latest
      })
    }

    const rows = COMPETITOR_LIST.map((competitorName) => {
      const pool = canonicalRows.filter(cp => cp.canonical_name === competitorName)
      const exact = pickLatest(pool.filter(cp => cp.canonical_condition === condition))
      const fallback = exact ? undefined : pickLatest(pool)
      const selected = exact || fallback

      return {
        name: competitorName,
        price: selected?.trade_in_price,
        sellPrice: selected?.sell_price,
        retrieved_at: selected?.retrieval_ts,
        source_condition: selected?.canonical_condition,
      }
    }).sort((a, b) => (b.price || 0) - (a.price || 0))

    const usedConditionFallback = rows.some(
      row => row.price != null && row.source_condition != null && row.source_condition !== condition
    )

    const priceValues = rows
      .map(r => r.price)
      .filter((price): price is number => price != null && price > 0)
    const highestPrice = priceValues.length > 0 ? Math.max(...priceValues) : undefined
    const averagePrice = priceValues.length > 0 ? priceValues.reduce((s, p) => s + p, 0) / priceValues.length : undefined

    const sellPriceValues = rows
      .map(r => r.sellPrice)
      .filter((price): price is number => price != null && price > 0)
    const averageSellPrice = sellPriceValues.length > 0 ? sellPriceValues.reduce((s, p) => s + p, 0) / sellPriceValues.length : undefined
    const highestSellPrice = sellPriceValues.length > 0 ? Math.max(...sellPriceValues) : undefined

    const latestRetrievedAt = rows.reduce<string | undefined>((latest, row) => {
      if (!row.retrieved_at) return latest
      if (!latest) return row.retrieved_at
      return new Date(row.retrieved_at).getTime() > new Date(latest).getTime() ? row.retrieved_at : latest
    }, undefined)

    return {
      rows,
      condition,
      usedConditionFallback,
      highestPrice,
      averagePrice,
      averageSellPrice,
      highestSellPrice,
      latestRetrievedAt,
    }
  })()

  // Competitor matrix computation
  const competitorMatrixRows = (() => {
    const allConditions: Array<'excellent' | 'good' | 'fair' | 'broken'> = ['excellent', 'good', 'fair', 'broken']

    const baseRows = new Map<string, {
      device_id: string
      storage: string
    }>()

    for (const cp of filteredComp) {
      const key = `${cp.device_id}|${cp.storage}`
      if (!baseRows.has(key)) {
        baseRows.set(key, { device_id: cp.device_id, storage: cp.storage })
      }
    }

    const byKey = new Map<string, {
      device_id: string
      storage: string
      condition: 'excellent' | 'good' | 'fair' | 'broken'
      prices: Record<string, number | null>
      sellPrices: Record<string, number | null>
      retrievedAtByCompetitor: Record<string, string | null>
      latestRetrievedAt: string | null
    }>()

    for (const { device_id, storage } of Array.from(baseRows.values())) {
      for (const condition of allConditions) {
        if (compConditionFilter !== 'all' && condition !== compConditionFilter) continue
        const prices: Record<string, number | null> = {}
        const sellPrices: Record<string, number | null> = {}
        const retrievedAtByCompetitor: Record<string, string | null> = {}
        for (const competitor of COMPETITOR_LIST) {
          prices[competitor] = null
          sellPrices[competitor] = null
          retrievedAtByCompetitor[competitor] = null
        }
        byKey.set(`${device_id}|${storage}|${condition}`, {
          device_id,
          storage,
          condition,
          prices,
          sellPrices,
          retrievedAtByCompetitor,
          latestRetrievedAt: null,
        })
      }
    }

    for (const cp of filteredComp) {
      const condition = (cp.condition || 'good') as 'excellent' | 'good' | 'fair' | 'broken'
      const key = `${cp.device_id}|${cp.storage}|${condition}`

      if (!byKey.has(key)) continue

      const row = byKey.get(key)!
      const canonicalCompetitorName = normalizeCompetitorName(cp.competitor_name)
      if (row.prices[canonicalCompetitorName] == null && cp.trade_in_price != null) {
        row.prices[canonicalCompetitorName] = cp.trade_in_price
      }
      if (row.sellPrices[canonicalCompetitorName] == null && cp.sell_price != null) {
        row.sellPrices[canonicalCompetitorName] = cp.sell_price
      }

      const retrievedAt = cp.retrieved_at || cp.scraped_at || cp.updated_at || cp.created_at || null
      if (retrievedAt) {
        const existingPerCompetitor = row.retrievedAtByCompetitor[canonicalCompetitorName]
        if (!existingPerCompetitor || retrievedAt > existingPerCompetitor) {
          row.retrievedAtByCompetitor[canonicalCompetitorName] = retrievedAt
        }

        if (!row.latestRetrievedAt || retrievedAt > row.latestRetrievedAt) {
          row.latestRetrievedAt = retrievedAt
        }
      }
    }

    return Array.from(byKey.values()).sort((a, b) => {
      const deviceCmp = getDeviceLabel(a.device_id).localeCompare(getDeviceLabel(b.device_id))
      if (deviceCmp !== 0) return deviceCmp
      const storageCmp = a.storage.localeCompare(b.storage)
      if (storageCmp !== 0) return storageCmp
      return a.condition.localeCompare(b.condition)
    })
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pricing Engine</h1>
          <p className="text-muted-foreground">Competitor-driven pricing for trade-in and CPO</p>
        </div>
      </div>

      <Tabs defaultValue="competitors">
        <TabsList>
          <TabsTrigger value="competitors"><TrendingUp className="mr-1.5 h-3.5 w-3.5" />Competitor Price Tracking</TabsTrigger>
          <TabsTrigger value="calculator"><Calculator className="mr-1.5 h-3.5 w-3.5" />Price Calculator</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="mr-1.5 h-3.5 w-3.5" />Settings</TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* TAB 1: COMPETITOR PRICE TRACKING */}
        {/* ============================================================ */}
        <TabsContent value="competitors" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search model, storage, competitor..." value={compSearch} onChange={e => setCompSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={compConditionFilter} onValueChange={v => setCompConditionFilter(v as 'all' | 'excellent' | 'good' | 'fair' | 'broken')}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conditions</SelectItem>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="broken">Broken</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priceMode} onValueChange={v => setPriceMode(v as 'trade_in' | 'cpo')}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trade_in">Trade-In Prices</SelectItem>
                  <SelectItem value="cpo">Sell / CPO Prices</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handleRunScraper} disabled={cpScraping}>
                <RefreshCw className={`mr-2 h-4 w-4 ${cpScraping ? 'animate-spin' : ''}`} />
                {cpScraping ? 'Scraping...' : 'Run Price Scraper'}
              </Button>
              <Button variant="outline" onClick={() => handleExportCompetitors('excel')}>
                <FileDown className="mr-2 h-4 w-4" />Excel
              </Button>
              <Button variant="outline" onClick={() => handleExportCompetitors('pdf')}>
                <FileDown className="mr-2 h-4 w-4" />PDF
              </Button>
              <Button onClick={() => setCpDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />Add Price
              </Button>
            </div>
          </div>

          {/* Competitor Matrix */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {priceMode === 'trade_in' ? 'Competitor Trade-In Prices' : 'Competitor Sell / CPO Prices'}
                {' '}({competitorMatrixRows.length} entries)
              </CardTitle>
              <CardDescription>
                Side-by-side comparison across Bell, Telus, GoRecell, and UniverCell — {priceMode === 'trade_in' ? 'what competitors offer customers for trade-in' : 'what competitors sell certified devices for'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cpLoading ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              ) : competitorMatrixRows.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <TrendingUp className="h-10 w-10 mb-3 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No competitor prices match filters</p>
                  <p className="text-xs mt-1">Run the price scraper or add prices manually.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device</TableHead>
                        <TableHead>Storage</TableHead>
                        <TableHead>Condition</TableHead>
                        {COMPETITOR_LIST.map(c => (
                          <TableHead key={c} className="text-right">{c}</TableHead>
                        ))}
                        <TableHead className="text-right">Avg</TableHead>
                        <TableHead className="text-right font-semibold text-primary">Our Quote</TableHead>
                        <TableHead className="text-right text-xs text-muted-foreground">Last Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {competitorMatrixRows.map((row) => {
                        const priceSource = priceMode === 'trade_in' ? row.prices : row.sellPrices
                        const priceValues = COMPETITOR_LIST
                          .map(c => priceSource[c])
                          .filter((p): p is number => p != null && p > 0)
                        const avg = priceValues.length > 0
                          ? priceValues.reduce((s, p) => s + p, 0) / priceValues.length
                          : null
                        const highestPrice = priceValues.length > 0 ? Math.max(...priceValues) : null

                        return (
                          <TableRow key={`${row.device_id}-${row.storage}-${row.condition}`}>
                            <TableCell className="font-medium">{getDeviceLabel(row.device_id)}</TableCell>
                            <TableCell>{row.storage}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize">{row.condition}</Badge>
                            </TableCell>
                            {COMPETITOR_LIST.map(c => {
                              const price = priceSource[c]
                              const isHighest = price != null && price === highestPrice && priceValues.length > 1
                              return (
                                <TableCell
                                  key={`${row.device_id}-${row.storage}-${row.condition}-${c}`}
                                  className={`text-right font-mono ${isHighest ? 'text-green-600 font-semibold' : ''}`}
                                  title={row.retrievedAtByCompetitor[c] ? `Retrieved: ${formatDateTime(row.retrievedAtByCompetitor[c] as string)}` : 'No data'}
                                >
                                  {price != null ? formatCurrency(price) : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              )
                            })}
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {avg != null ? formatCurrency(avg) : '—'}
                            </TableCell>
                            {/* Our suggested quote price — avg with profit margin */}
                            <TableCell className="text-right font-mono font-semibold text-primary">
                              {avg != null ? (() => {
                                const marginPct = priceMode === 'trade_in'
                                  ? parseFloat(settingsForm.trade_in_profit_percent || '20')
                                  : parseFloat(settingsForm.cpo_markup_percent || '25')
                                const quotePrice = priceMode === 'trade_in'
                                  ? avg * (1 - marginPct / 100) // Trade-in: pay less than market
                                  : avg * (1 + marginPct / 100) // CPO: sell above market
                                return formatCurrency(quotePrice)
                              })() : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              {row.latestRetrievedAt ? (
                                <div className="text-right">
                                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                                    {formatDateTime(row.latestRetrievedAt)}
                                  </div>
                                  {(() => {
                                    const daysAgo = Math.floor((Date.now() - new Date(row.latestRetrievedAt).getTime()) / (24 * 60 * 60 * 1000))
                                    return daysAgo > 7 ? (
                                      <Badge variant="destructive" className="text-[10px] mt-0.5">Stale</Badge>
                                    ) : null
                                  })()}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
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

          {/* Benchmark Pricing Tool */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Benchmark Pricing Tool</CardTitle>
              <CardDescription>
                Apply a +/- adjustment across all devices using the average of available competitors for the selected condition to set your {priceMode === 'trade_in' ? 'trade-in' : 'CPO'} prices
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4">
              <Select value={benchmark.condition} onValueChange={v => setBenchmark(prev => ({ ...prev, condition: v as 'excellent' | 'good' | 'fair' | 'broken' }))}>
                <SelectTrigger><SelectValue placeholder="Condition" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="broken">Broken</SelectItem>
                </SelectContent>
              </Select>
              <Select value={benchmark.adjustment_type} onValueChange={v => setBenchmark(prev => ({ ...prev, adjustment_type: v as 'percent' | 'fixed' }))}>
                <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent (%)</SelectItem>
                  <SelectItem value="fixed">Fixed ($)</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Select value={benchmark.direction} onValueChange={v => setBenchmark(prev => ({ ...prev, direction: v as 'increase' | 'decrease' }))}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">Increase</SelectItem>
                    <SelectItem value="decrease">Decrease</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={benchmark.value}
                  onChange={e => setBenchmark(prev => ({ ...prev, value: e.target.value }))}
                  placeholder={benchmark.adjustment_type === 'percent' ? '10' : '25'}
                />
              </div>
              <Button onClick={handlePreviewBenchmark} disabled={benchmarkApplying}>
                Preview & Apply
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 2: PRICE CALCULATOR */}
        {/* ============================================================ */}
        <TabsContent value="calculator" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price Calculator</CardTitle>
              <CardDescription>Calculate trade-in and CPO prices based on competitor data and pricing engine</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label>Device</Label>
                  <Select
                    value={calcForm.device_id}
                    onValueChange={(v) => {
                      const selected = deviceMap.get(v)
                      const options = getStorageOptionsForDevice(selected)
                      const nextStorage = options.includes('128GB') ? '128GB' : (options[0] || '')
                      setCalcForm(f => ({ ...f, device_id: v, storage: nextStorage }))
                      setCalcResult(null)
                    }}
                  >
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
                  <Select
                    value={calcForm.storage}
                    onValueChange={v => { setCalcForm(f => ({ ...f, storage: v })); setCalcResult(null) }}
                    disabled={!calcForm.device_id || calcStorageOptions.length === 0}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {calcStorageOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select value={calcForm.condition} onValueChange={v => { setCalcForm(f => ({ ...f, condition: v as DeviceCondition })); setCalcResult(null) }}>
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
                      <SelectItem value="retail">Retail (20%)</SelectItem>
                      <SelectItem value="enterprise">Enterprise (12%)</SelectItem>
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

              {/* Live Competitor Snapshot */}
              {calcForm.device_id && calcForm.storage && (
                <Card className="mt-6">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Live Competitor Snapshot</CardTitle>
                    <CardDescription className="text-xs">
                      {getDeviceLabel(calcForm.device_id)} &bull; {calcForm.storage} &bull;
                      <span className="capitalize"> {calculatorCompetitorSnapshot.condition}</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="capitalize">{calculatorCompetitorSnapshot.condition}</Badge>
                      {calculatorCompetitorSnapshot.usedConditionFallback && (
                        <Badge variant="outline">Condition fallback applied</Badge>
                      )}
                      {calculatorCompetitorSnapshot.latestRetrievedAt && (
                        <span>Latest retrieval: {formatDateTime(calculatorCompetitorSnapshot.latestRetrievedAt)}</span>
                      )}
                    </div>

                    {calculatorCompetitorSnapshot.rows.every(r => r.price == null) ? (
                      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        No competitor prices found for this device and storage yet. Run the scraper to fetch prices.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          {calculatorCompetitorSnapshot.highestPrice != null && (
                            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                              Highest trade-in: <span className="font-mono font-medium">{formatCurrency(calculatorCompetitorSnapshot.highestPrice)}</span>
                            </div>
                          )}
                          {calculatorCompetitorSnapshot.averagePrice != null && (
                            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs">
                              Avg trade-in: <span className="font-mono font-medium text-blue-600">{formatCurrency(calculatorCompetitorSnapshot.averagePrice)}</span>
                            </div>
                          )}
                          {calculatorCompetitorSnapshot.highestSellPrice != null && (
                            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                              Highest CPO/sell: <span className="font-mono font-medium">{formatCurrency(calculatorCompetitorSnapshot.highestSellPrice)}</span>
                            </div>
                          )}
                          {calculatorCompetitorSnapshot.averageSellPrice != null && (
                            <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 px-3 py-2 text-xs">
                              Avg CPO/sell: <span className="font-mono font-medium text-green-600">{formatCurrency(calculatorCompetitorSnapshot.averageSellPrice)}</span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          {calculatorCompetitorSnapshot.rows.map((row) => (
                            <div key={row.name} className="flex items-center justify-between rounded-md border px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">{row.name}</span>
                                {row.source_condition && row.source_condition !== calculatorCompetitorSnapshot.condition && (
                                  <Badge variant="outline" className="text-[10px] capitalize">from {row.source_condition}</Badge>
                                )}
                              </div>
                              <div className="text-right flex items-center gap-3">
                                <div>
                                  <div className="font-mono text-blue-600">{row.price != null ? formatCurrency(row.price) : '—'}</div>
                                  <div className="text-[10px] text-muted-foreground">Trade-in</div>
                                </div>
                                <div>
                                  <div className="font-mono text-green-600">{row.sellPrice != null ? formatCurrency(row.sellPrice) : '—'}</div>
                                  <div className="text-[10px] text-muted-foreground">CPO/Sell</div>
                                </div>
                                <div className="text-[11px] text-muted-foreground min-w-[80px] text-right">
                                  {row.retrieved_at ? formatDateTime(row.retrieved_at) : ''}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Calculation Results */}
              {calcResult && (
                <div className="mt-6 space-y-4">
                  {!calcResult.success ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                          Full pricing engine returned: {calcResult.error || 'No market data found'}
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                          Showing competitor-based suggestion instead.
                        </p>
                      </div>
                      {calculatorCompetitorSnapshot.averagePrice != null && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-xl border p-5">
                            <p className="text-sm text-muted-foreground">Suggested Trade-In Price</p>
                            <p className="text-2xl font-bold text-blue-600 mt-1">
                              {formatCurrency(calculatorCompetitorSnapshot.averagePrice)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">Based on average of {calculatorCompetitorSnapshot.rows.filter(r => r.price != null).length} competitor prices</p>
                          </div>
                          {calculatorCompetitorSnapshot.highestPrice != null && (
                            <div className="rounded-xl border p-5">
                              <p className="text-sm text-muted-foreground">Highest Competitor Offer</p>
                              <p className="text-2xl font-bold text-green-600 mt-1">
                                {formatCurrency(calculatorCompetitorSnapshot.highestPrice)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">Match or beat this to win the trade-in</p>
                            </div>
                          )}
                        </div>
                      )}
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

                      {/* Unit Price & Total */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="rounded-xl border p-5">
                          <p className="text-sm text-muted-foreground">Trade-In Unit Price</p>
                          <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(calcResult.trade_price)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">What we offer per device</p>
                        </div>
                        <div className="rounded-xl border p-5">
                          <p className="text-sm text-muted-foreground">CPO Unit Price</p>
                          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(calcResult.cpo_price)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Certified sell price per device</p>
                        </div>
                        <div className="rounded-xl border p-5">
                          <p className="text-sm text-muted-foreground">Channel Recommendation</p>
                          {(() => {
                            const tier = calcResult.channel_decision.margin_tier
                            const config = MARGIN_TIER_CONFIG[tier]
                            const achievedMarginPercent = Math.round(calcResult.channel_decision.margin_percent * 100)
                            return (
                              <>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-sm font-semibold ${config.bgColor} ${config.color}`}>
                                    {achievedMarginPercent}%
                                  </span>
                                  <span className="font-bold capitalize">{calcResult.channel_decision.recommended_channel}</span>
                                </div>
                                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                                  <p>Achieved: {achievedMarginPercent}% | Target: {calcResult.margin_target_percent ?? (calcResult.risk_mode === 'enterprise' ? 12 : 20)}%</p>
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
                                <span className="text-muted-foreground">Breakage Risk</span>
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
                            <CardTitle className="text-sm">Competitor Context</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            {calcResult.competitors.length > 0 ? (
                              <div className="space-y-1">
                                {calcResult.competitors.map(c => (
                                  <div key={c.name} className="flex justify-between">
                                    <span className="text-muted-foreground">{c.name}</span>
                                    <span className="font-mono">{formatCurrency(c.price)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No competitor data available</p>
                            )}
                            {calcResult.repair_buffer != null && (
                              <div className="flex justify-between border-t pt-2">
                                <span className="text-muted-foreground">Repair Buffer</span>
                                <span className={`font-mono ${calcResult.repair_buffer > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(calcResult.repair_buffer)}
                                </span>
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
                            <CardTitle className="text-sm">D-Grade Formula</CardTitle>
                            <CardDescription className="text-xs">Selling Price - Fees - Margin - Repairs - Breakage = Trade Price</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Selling Price</span>
                              <span className="font-mono">{formatCurrency(calcResult.d_grade_formula.selling_price)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Fees</span>
                              <span className="font-mono text-red-600">-{formatCurrency(calcResult.d_grade_formula.marketplace_fees)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Margin</span>
                              <span className="font-mono text-red-600">-{formatCurrency(calcResult.d_grade_formula.margin_deduction)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Est. Repairs</span>
                              <span className="font-mono text-red-600">-{formatCurrency(calcResult.d_grade_formula.estimated_repairs)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Breakage Risk</span>
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
                        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 p-4">
                          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Outlier Detected</p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">{calcResult.outlier_reason}</p>
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
        {/* TAB 3: PRICING SETTINGS */}
        {/* ============================================================ */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          {/* Model Training Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Pricing Model Training</CardTitle>
                  <CardDescription>Train the self-learning model from order history, IMEI records, sales data, and competitor prices.</CardDescription>
                </div>
                <Button
                  variant={trainingInProgress ? 'secondary' : 'default'}
                  size="sm"
                  disabled={trainingInProgress}
                  onClick={async () => {
                    setTrainingInProgress(true)
                    setTrainingResult(null)
                    const startTime = Date.now()
                    try {
                      const res = await fetch('/api/pricing/train', { method: 'POST' })
                      const d = await res.json()
                      const duration_ms = Date.now() - startTime
                      if (res.ok) {
                        setTrainingResult({ ...d, success: true, duration_ms })
                        toast.success('Model trained successfully')
                      } else {
                        setTrainingResult({ success: false, baselines_upserted: 0, condition_multipliers_updated: false, sample_counts: { order_items: 0, imei_records: 0, sales_history: 0, market_prices: 0, competitor_prices: 0 }, errors: [d.error || 'Training failed'], timestamp: new Date().toISOString(), duration_ms })
                        toast.error(d.error || 'Training failed')
                      }
                    } catch {
                      setTrainingResult({ success: false, baselines_upserted: 0, condition_multipliers_updated: false, sample_counts: { order_items: 0, imei_records: 0, sales_history: 0, market_prices: 0, competitor_prices: 0 }, errors: ['Network error'], timestamp: new Date().toISOString(), duration_ms: Date.now() - startTime })
                      toast.error('Training failed — network error')
                    } finally {
                      setTrainingInProgress(false)
                    }
                  }}
                >
                  {trainingInProgress ? (
                    <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Training...</>
                  ) : (
                    <><Activity className="mr-2 h-4 w-4" />Train Model</>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {trainingInProgress && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Training in progress...</p>
                    <p className="text-xs text-muted-foreground">Aggregating data from 5 sources with weighted trust levels. This may take a few seconds.</p>
                  </div>
                </div>
              )}

              {trainingResult && !trainingInProgress && (
                <div className="space-y-3">
                  <div className={`rounded-lg border p-4 ${trainingResult.success ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <p className={`text-sm font-medium ${trainingResult.success ? 'text-green-600' : 'text-red-600'}`}>
                        {trainingResult.success ? 'Training Complete' : 'Training Failed'}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Duration: {(trainingResult.duration_ms / 1000).toFixed(1)}s</span>
                        <span>{formatDateTime(trainingResult.timestamp)}</span>
                      </div>
                    </div>

                    {trainingResult.success && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-md border bg-background px-3 py-2">
                          <p className="text-xs text-muted-foreground">Baselines Created</p>
                          <p className="text-lg font-bold">{trainingResult.baselines_upserted}</p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <p className="text-xs text-muted-foreground">Condition Multipliers</p>
                          <p className="text-lg font-bold">{trainingResult.condition_multipliers_updated ? 'Updated' : 'Unchanged'}</p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <p className="text-xs text-muted-foreground">Total Samples</p>
                          <p className="text-lg font-bold">
                            {(trainingResult.sample_counts.order_items + trainingResult.sample_counts.imei_records + trainingResult.sample_counts.sales_history + trainingResult.sample_counts.market_prices + trainingResult.sample_counts.competitor_prices).toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-md border bg-background px-3 py-2">
                          <p className="text-xs text-muted-foreground">Data Sources</p>
                          <p className="text-lg font-bold">{Object.values(trainingResult.sample_counts).filter(v => v > 0).length}/5</p>
                        </div>
                      </div>
                    )}

                    {trainingResult.success && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Sample Breakdown</p>
                        <div className="flex flex-wrap gap-2">
                          {trainingResult.sample_counts.order_items > 0 && (
                            <Badge variant="secondary" className="text-xs">Orders: {trainingResult.sample_counts.order_items}</Badge>
                          )}
                          {trainingResult.sample_counts.imei_records > 0 && (
                            <Badge variant="secondary" className="text-xs">IMEI: {trainingResult.sample_counts.imei_records}</Badge>
                          )}
                          {trainingResult.sample_counts.sales_history > 0 && (
                            <Badge variant="secondary" className="text-xs">Sales: {trainingResult.sample_counts.sales_history}</Badge>
                          )}
                          {trainingResult.sample_counts.market_prices > 0 && (
                            <Badge variant="secondary" className="text-xs">Market: {trainingResult.sample_counts.market_prices}</Badge>
                          )}
                          {trainingResult.sample_counts.competitor_prices > 0 && (
                            <Badge variant="secondary" className="text-xs">Competitors: {trainingResult.sample_counts.competitor_prices}</Badge>
                          )}
                          {Object.values(trainingResult.sample_counts).every(v => v === 0) && (
                            <span className="text-xs text-muted-foreground">No training data found in any source.</span>
                          )}
                        </div>
                      </div>
                    )}

                    {trainingResult.errors.length > 0 && (
                      <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/5 p-2">
                        <p className="text-xs font-medium text-red-600 mb-1">Errors ({trainingResult.errors.length})</p>
                        {trainingResult.errors.map((err, i) => (
                          <p key={i} className="text-xs text-red-500">{err}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!trainingResult && !trainingInProgress && (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <Activity className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">Click &quot;Train Model&quot; to learn pricing baselines from your data.</p>
                  <p className="text-xs text-muted-foreground mt-1">Uses order history, IMEI records, sales, market prices, and competitor data with weighted trust levels.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pricing Engine Settings Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pricing Engine Settings</CardTitle>
              <CardDescription>Controls for margin targets, competitiveness, and routing. Changes apply to new calculations only.</CardDescription>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              ) : (
                <div className="space-y-6">
                  {/* Model Preference */}
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <Label htmlFor="prefer-data-driven" className="text-sm font-medium">Use Self-Learning Model</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {settingsForm.prefer_data_driven === 'true'
                          ? 'Pricing uses trained baselines from your order history first, then falls back to competitor data.'
                          : 'Pricing uses competitor and market data directly. Train the model above to enable self-learning.'}
                      </p>
                    </div>
                    <Switch
                      id="prefer-data-driven"
                      checked={settingsForm.prefer_data_driven === 'true'}
                      onCheckedChange={v => setSettingsForm(prev => ({ ...prev, prefer_data_driven: v ? 'true' : 'false' }))}
                    />
                  </div>

                  {/* Margin Mode */}
                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Margin Mode</Label>
                      <Select
                        value={settingsForm.margin_mode || SETTINGS_DEFAULTS.margin_mode}
                        onValueChange={v => setSettingsForm(prev => ({ ...prev, margin_mode: v }))}
                      >
                        <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (uses target margins below)</SelectItem>
                          <SelectItem value="custom">Custom (single margin for all quotes)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {(settingsForm.margin_mode || SETTINGS_DEFAULTS.margin_mode) === 'auto'
                          ? 'Retail and enterprise quotes use their own target margins.'
                          : 'All quotes use one fixed margin rule.'}
                      </p>
                    </div>

                    {settingsForm.margin_mode === 'custom' && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label htmlFor="setting-custom_margin_percent" className="text-sm">Custom Margin (%)</Label>
                          <Input
                            id="setting-custom_margin_percent"
                            type="number"
                            step="0.01"
                            min="0"
                            value={settingsForm.custom_margin_percent ?? SETTINGS_DEFAULTS.custom_margin_percent}
                            onChange={e => setSettingsForm(prev => ({ ...prev, custom_margin_percent: e.target.value }))}
                            placeholder="e.g. 18"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="setting-custom_margin_amount" className="text-sm">Custom Margin ($)</Label>
                          <Input
                            id="setting-custom_margin_amount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={settingsForm.custom_margin_amount ?? SETTINGS_DEFAULTS.custom_margin_amount}
                            onChange={e => setSettingsForm(prev => ({ ...prev, custom_margin_amount: e.target.value }))}
                            placeholder="Used when % is empty"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick Setup */}
                  <div className="rounded-lg border p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium">Margin & Competitiveness</p>
                      <p className="text-xs text-muted-foreground">Core settings that affect every price calculation.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {CORE_SETTINGS_FIELDS.map(f => (
                        <div key={f.key} className="space-y-1">
                          <Label htmlFor={`setting-${f.key}`} className="text-sm">{f.label}</Label>
                          <Input
                            id={`setting-${f.key}`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={settingsForm[f.key] ?? SETTINGS_DEFAULTS[f.key] ?? ''}
                            onChange={e => setSettingsForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder="—"
                          />
                          <p className="text-xs text-muted-foreground">{f.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Advanced Settings */}
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Advanced: Routing & Alerts</p>
                        <p className="text-xs text-muted-foreground">Tune channel routing thresholds and outlier detection.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowAdvancedSettings(v => !v)}>
                        {showAdvancedSettings ? 'Hide' : 'Show'}
                      </Button>
                    </div>

                    {showAdvancedSettings && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {ADVANCED_SETTINGS_FIELDS.map(f => (
                          <div key={f.key} className="space-y-1">
                            <Label htmlFor={`setting-${f.key}`} className="text-sm">{f.label}</Label>
                            <Input
                              id={`setting-${f.key}`}
                              type="number"
                              step="0.01"
                              min="0"
                              value={settingsForm[f.key] ?? SETTINGS_DEFAULTS[f.key] ?? ''}
                              onChange={e => setSettingsForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                              placeholder="—"
                            />
                            <p className="text-xs text-muted-foreground">{f.desc}</p>
                          </div>
                        ))}
                      </div>
                    )}
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

      {/* Competitor Price Dialog */}
      <Dialog open={cpDialogOpen} onOpenChange={(open) => {
        setCpDialogOpen(open)
        if (!open) {
          setCpDeviceSearch('')
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Competitor Price</DialogTitle>
            <DialogDescription>Track a competitor&apos;s trade-in or resale offer</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Device</Label>
                <Input
                  value={cpDeviceSearch}
                  onChange={(event) => {
                    const value = event.target.value
                    setCpDeviceSearch(value)
                    const exact = devices.find((device) => `${device.make} ${device.model}`.toLowerCase() === value.trim().toLowerCase())
                    setCpForm((prev) => ({ ...prev, device_id: exact?.id || '' }))
                  }}
                  placeholder="Type device name (e.g. iPhone 13)"
                />
                <Select
                  value={cpForm.device_id}
                  onValueChange={(value) => {
                    const selected = deviceMap.get(value)
                    setCpForm((prev) => ({ ...prev, device_id: value }))
                    if (selected) setCpDeviceSearch(`${selected.make} ${selected.model}`)
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {filteredCpDevices.map(d => <SelectItem key={d.id} value={d.id}>{d.make} {d.model}</SelectItem>)}
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
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={cpForm.condition} onValueChange={v => setCpForm(f => ({ ...f, condition: v as 'excellent' | 'good' | 'fair' | 'broken' }))}>
                <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="broken">Broken</SelectItem>
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
            <Button onClick={handleCpSave} disabled={cpSaving || !cpForm.competitor_name}>
              {cpSaving ? 'Saving...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Benchmark Preview Dialog */}
      <Dialog open={benchmarkPreviewOpen} onOpenChange={setBenchmarkPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Benchmark Preview</DialogTitle>
            <DialogDescription>
              Review the proposed prices before applying. Based on all competitor averages ({benchmark.condition})
              {benchmark.direction === 'increase' ? ' +' : ' -'}{benchmark.value}{benchmark.adjustment_type === 'percent' ? '%' : '$'}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead className="text-right">Reference</TableHead>
                <TableHead className="text-right">Proposed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {benchmarkPreview.map((item, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{item.device_label}</TableCell>
                  <TableCell>{item.storage}</TableCell>
                  <TableCell className="capitalize">{item.condition}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(item.current_price)}</TableCell>
                  <TableCell className="text-right font-mono font-medium">{formatCurrency(item.proposed_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBenchmarkPreviewOpen(false)}>Cancel</Button>
            <Button onClick={handleApplyBenchmark} disabled={benchmarkApplying}>
              {benchmarkApplying ? 'Applying...' : `Apply ${benchmarkPreview.length} Prices`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Competitor Price Confirmation */}
      <AlertDialog open={!!cpDeleteTarget} onOpenChange={(open) => { if (!open) setCpDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Competitor Price</AlertDialogTitle>
            <AlertDialogDescription>This will remove this competitor price entry. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => cpDeleteTarget && handleCpDelete(cpDeleteTarget)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
