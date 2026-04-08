// ============================================================================
// ADMIN - PRICING MANAGEMENT PAGE (Competitor-Driven)
// ============================================================================

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Plus, Trash2, TrendingUp, Calculator, Settings, RefreshCw, FileDown, Activity, DollarSign, LayoutGrid, ChevronDown, ChevronRight, ShoppingBag, ArrowDownRight, Globe, Database, Upload, Zap, Loader2 } from 'lucide-react'
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
import { PageHero } from '@/components/ui/page-hero'
import { CONDITION_CONFIG, STORAGE_OPTIONS, MARGIN_TIER_CONFIG, COMPETITORS as COMPETITOR_LIST, COMPETITOR_DISPLAY_NAMES } from '@/lib/constants'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { CompetitorPrice, DeviceCondition, Device, PriceCalculationResultV2 } from '@/types'

const conditions: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']

function mapCalculatorConditionToCompetitorCondition(condition: DeviceCondition): 'excellent' | 'good' | 'fair' | 'broken' {
  if (condition === 'new' || condition === 'excellent') return 'excellent'
  if (condition === 'fair') return 'fair'
  if (condition === 'poor') return 'broken'
  return 'good'
}

/** Condition multipliers for deriving Our Quote from device-level competitor data (matches pricing.service) */
const CONDITION_MULT_FOR_QUOTE: Record<string, number> = {
  excellent: 0.95,
  good: 0.85,
  fair: 0.70,
  broken: 0.5,
}

function normalizeCompetitorName(name?: string): string {
  const normalized = (name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalized === 'goresell' || normalized === 'go recell' || normalized === 'gorecell' || normalized === 'go resell') return 'GoRecell'
  if (normalized === 'telus') return 'Telus'
  if (normalized === 'bell') return 'Bell'
  if (normalized === 'universal' || normalized === 'universalcell' || normalized === 'univercell') return 'UniverCell'
  if (normalized === 'apple trade-in' || normalized === 'apple tradein') return 'Apple Trade-In'
  return name || 'Unknown'
}

function buildTradeInPolicyReference(rows: Array<{ name: string; price: number | null | undefined }>) {
  const canonicalRows = rows
    .map((row) => ({
      name: normalizeCompetitorName(row.name),
      price: row.price != null && row.price > 0 ? row.price : null,
    }))
    .filter((row): row is { name: string; price: number } => row.price != null && ['Bell', 'Telus', 'GoRecell'].includes(row.name))

  const bellTelusRows = canonicalRows.filter((row) => row.name === 'Bell' || row.name === 'Telus')
  const bellTelusAvg = bellTelusRows.length > 0
    ? bellTelusRows.reduce((sum, row) => sum + row.price, 0) / bellTelusRows.length
    : undefined
  const goRecellPrice = canonicalRows.find((row) => row.name === 'GoRecell')?.price

  let referencePrice: number | undefined
  if (bellTelusAvg != null && goRecellPrice != null) {
    referencePrice = (bellTelusAvg + goRecellPrice) / 2
  } else if (goRecellPrice != null) {
    referencePrice = goRecellPrice
  } else if (bellTelusAvg != null) {
    referencePrice = bellTelusAvg
  }

  const highestPrice = canonicalRows.length > 0 ? Math.max(...canonicalRows.map((row) => row.price)) : undefined
  const averagePrice = canonicalRows.length > 0
    ? canonicalRows.reduce((sum, row) => sum + row.price, 0) / canonicalRows.length
    : undefined

  return {
    canonicalRows,
    bellTelusRows,
    bellTelusAvg,
    goRecellPrice,
    referencePrice,
    highestPrice,
    averagePrice,
  }
}

function normalizeStorageOption(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

async function readResponsePayload<T>(response: Response): Promise<T | null> {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch {
    const condensed = text
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    throw new Error(
      condensed || `Request failed with status ${response.status}`
    )
  }
}

/** Normalize storage for matrix key matching (e.g. "256 GB" -> "256GB") */
function normalizeStorageForKey(value?: string): string {
  return normalizeStorageOption(value || '128GB')
}

function isEnterpriseStorageOption(value: string): boolean {
  return /^(\d+)(GB|TB)$/.test(normalizeStorageOption(value))
}

const SETTINGS_DEFAULTS: Record<string, string> = {
  trade_in_profit_percent: '20',
  enterprise_margin_percent: '12',
  breakage_risk_percent: '5',
  competitive_relevance_min: '0.70',
  competitor_ceiling_percent: '0',
  beat_competitor_percent: '0',
  beat_competitor_amount: '12',
  cpo_beat_amount: '10',
  price_staleness_days: '7',
  channel_green_min: '0.30',
  channel_yellow_min: '0.20',
  outlier_deviation_threshold: '0.20',
  cpo_markup_percent: '18',
  cpo_enterprise_markup_percent: '15',
  margin_mode: 'auto',
  custom_margin_percent: '0',
  custom_margin_amount: '0',
  prefer_data_driven: 'false',
  cpo_depreciation_rate: '15',
  cpo_buyback_years: '3',
}

type DepreciationPreviewBrand = 'apple' | 'samsung' | 'google' | 'oneplus' | 'other'

const DEPRECIATION_PRESET_BY_BRAND: Record<Exclude<DepreciationPreviewBrand, 'other'>, string> = {
  apple: '12',
  samsung: '18',
  google: '20',
  oneplus: '22',
}

const DEPRECIATION_BRAND_LABEL: Record<DepreciationPreviewBrand, string> = {
  apple: 'Apple',
  samsung: 'Samsung',
  google: 'Google',
  oneplus: 'OnePlus',
  other: 'Other',
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
  const [compCompetitorFilter, setCompCompetitorFilter] = useState<string>('all')
  const [formulaPrices, setFormulaPrices] = useState<Map<string, { trade_price: number; cpo_price: number }>>(new Map())
  const [formulaLoading, setFormulaLoading] = useState(false)
  const [formulaRefreshTrigger, setFormulaRefreshTrigger] = useState(0)
  const [cleanupUnknownLoading, setCleanupUnknownLoading] = useState(false)
  const [cpForm, setCpForm] = useState({
    device_id: '', storage: '', competitor_name: '', condition: 'good' as 'excellent' | 'good' | 'fair' | 'broken', trade_in_price: '', sell_price: '',
  })
  const [cpDeviceSearch, setCpDeviceSearch] = useState('')

  // Trade-in / CPO controls
  const [priceMode, setPriceMode] = useState<'trade_in' | 'cpo'>('trade_in')
  const [benchmarkApplying, setBenchmarkApplying] = useState(false)
  const [benchmark, setBenchmark] = useState({
    condition: 'all' as 'all' | 'excellent' | 'good' | 'fair' | 'broken',
    adjustment_type: 'fixed' as 'percent' | 'fixed',
    direction: 'increase' as 'increase' | 'decrease',
    value: '',
  })
  const [benchmarkPreview, setBenchmarkPreview] = useState<Array<{
    device_id: string; device_label: string; storage: string; condition: string;
    current_price: number; proposed_price: number;
  }>>([])
  const [benchmarkPreviewOpen, setBenchmarkPreviewOpen] = useState(false)

  // Calculator tab
  const [calcDeviceFilter, setCalcDeviceFilter] = useState('')
  const [calcForm, setCalcForm] = useState({
    device_id: '', storage: '', carrier: 'Unlocked', condition: 'good' as DeviceCondition,
    risk_mode: 'retail' as 'retail' | 'enterprise',
    trade_in_profit_percent: '',
    cpo_markup_percent: '',
    enterprise_margin_percent: '',
    beat_competitor_percent: '',
  })
  const [calcResult, setCalcResult] = useState<PriceCalculationResultV2 | null>(null)
  const [calculating, setCalculating] = useState(false)

  // Free-text device search for price lookup (even not in catalog)
  const [calcDeviceSearch, setCalcDeviceSearch] = useState('')
  const [calcSearchResults, setCalcSearchResults] = useState<Array<{
    device_name: string; storage: string; condition: string
    prices: { competitor: string; trade_in: number | null; sell: number | null }[]
    avg_trade: number | null; avg_sell: number | null
  }>>([])
  const [calcSearching, setCalcSearching] = useState(false)

  // CPO Calculator state
  const [cpoCalcDeviceFilter, setCpoCalcDeviceFilter] = useState('')
  const [cpoCalcForm, setCpoCalcForm] = useState({ device_id: '', storage: '' })
  const [cpoCalcResult, setCpoCalcResult] = useState<{ avgSellPrice: number; ourMarkupPrice: number } | null>(null)

  const handleCalcSearch = async () => {
    const q = calcDeviceSearch.trim()
    if (!q) return
    setCalcSearching(true)
    setCalcSearchResults([])
    try {
      const res = await fetch(`/api/pricing/competitors?search=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const rows: CompetitorPrice[] = data.data || []
      if (rows.length === 0) {
        toast.info('No competitor prices found for that device. Try running the scraper first.')
        return
      }
      const grouped = new Map<string, typeof calcSearchResults[0]>()
      for (const row of rows) {
        const label = getDeviceLabel(row.device_id)
        const key = `${label}|${row.storage}|${row.condition || 'good'}`
        if (!grouped.has(key)) {
          grouped.set(key, {
            device_name: label,
            storage: row.storage,
            condition: row.condition || 'good',
            prices: [],
            avg_trade: null,
            avg_sell: null,
          })
        }
        const group = grouped.get(key)!
        group.prices.push({
          competitor: row.competitor_name,
          trade_in: row.trade_in_price ?? null,
          sell: row.sell_price ?? null,
        })
      }
      const results = Array.from(grouped.values()).map(g => {
        const trades = g.prices.map(p => p.trade_in).filter((v): v is number => v != null && v > 0)
        const sells = g.prices.map(p => p.sell).filter((v): v is number => v != null && v > 0)
        return {
          ...g,
          avg_trade: trades.length > 0 ? Math.round((trades.reduce((s, v) => s + v, 0) / trades.length) * 100) / 100 : null,
          avg_sell: sells.length > 0 ? Math.round((sells.reduce((s, v) => s + v, 0) / sells.length) * 100) / 100 : null,
        }
      })
      results.sort((a, b) => a.device_name.localeCompare(b.device_name) || a.storage.localeCompare(b.storage) || a.condition.localeCompare(b.condition))
      setCalcSearchResults(results)
    } catch {
      toast.error('Search failed')
    } finally { setCalcSearching(false) }
  }

  // Pricing settings tab
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({})
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [showQuoteRefreshBanner, setShowQuoteRefreshBanner] = useState(false)
  const [sendingQuoteUpdate, setSendingQuoteUpdate] = useState(false)

  // Depreciation preview
  const [depreciationInput, setDepreciationInput] = useState('')
  const [previewDepreciationBrand, setPreviewDepreciationBrand] = useState<DepreciationPreviewBrand>('apple')
  // Local override for preview rate — doesn't affect saved settings
  const [previewDepreciationRate, setPreviewDepreciationRate] = useState('')
  const globalSavedDepreciationRate = settingsForm.cpo_depreciation_rate || SETTINGS_DEFAULTS.cpo_depreciation_rate
  const brandDefaultDepreciationRate = previewDepreciationBrand === 'other'
    ? globalSavedDepreciationRate
    : DEPRECIATION_PRESET_BY_BRAND[previewDepreciationBrand]

  const effectivePreviewDepreciationRate = previewDepreciationRate !== ''
    ? previewDepreciationRate
    : brandDefaultDepreciationRate

  const depreciationSchedule = useMemo(() => {
    const price = parseFloat(depreciationInput)
    if (!Number.isFinite(price) || price <= 0) return []
    const rawRate = effectivePreviewDepreciationRate
    const rate = parseFloat(rawRate) / 100
    const years = parseInt(settingsForm.cpo_buyback_years || SETTINGS_DEFAULTS.cpo_buyback_years, 10)
    const schedule: Array<{ year: number; value: number; depreciation: number }> = []
    let current = price
    for (let y = 1; y <= years; y++) {
      const depreciation = current * rate
      current = current - depreciation
      schedule.push({ year: y, value: Math.round(current * 100) / 100, depreciation: Math.round(depreciation * 100) / 100 })
    }
    return schedule
  }, [depreciationInput, effectivePreviewDepreciationRate, settingsForm.cpo_buyback_years])

  // International pricing upload
  const [intlFile, setIntlFile] = useState<File | null>(null)
  const [intlUploading, setIntlUploading] = useState(false)
  const [intlResult, setIntlResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)

  // Catalog tab - full pricing data by category
  const [catalogData, setCatalogData] = useState<{
    data: Array<{
      category: string
      device_count: number
      total_baselines: number
      total_market_entries: number
      total_pricing_entries: number
      total_competitor_entries: number
      price_range: { min: number; max: number } | null
      devices: Array<{
        id: string
        make: string
        model: string
        category: string | null
        baselines: Array<{ storage: string; condition: string; median: number; samples: number; sources: string[] }>
        market_prices: Array<{ storage: string; wholesale: number; trade?: number }>
        pricing_tables: Array<{ condition: string; storage?: string; base: number }>
        competitor_count: number
        price_range: { min: number; max: number } | null
      }>
    }>
    summary: { total_devices: number; total_baselines: number; total_market_entries: number; total_pricing_entries: number; total_competitor_entries: number }
  } | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogExpanded, setCatalogExpanded] = useState<Set<string>>(new Set())
  const [catalogDeviceExpanded, setCatalogDeviceExpanded] = useState<Set<string>>(new Set())

  const fetchCatalog = useCallback(async () => {
    setCatalogLoading(true)
    try {
      const res = await fetch('/api/pricing/catalog')
      if (res.ok) {
        const json = await res.json()
        setCatalogData(json)
      }
    } catch {
      toast.error('Failed to load pricing catalog')
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  // Training state
  const [trainingInProgress, setTrainingInProgress] = useState(false)
  const [trainingResult, setTrainingResult] = useState<{
    success: boolean
    baselines_upserted: number
    condition_multipliers_updated: boolean
    sample_counts: { order_items: number; imei_records: number; sales_history: number; market_prices: number; competitor_prices: number; training_data: number }
    errors: string[]
    timestamp: string
    duration_ms: number
  } | null>(null)

  // Fetch data
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices?page_size=5000')
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

  useEffect(() => { fetchDevices(); fetchCompetitorPrices(); fetchSettings(); fetchCatalog() }, [fetchDevices, fetchCompetitorPrices, fetchSettings, fetchCatalog])

  const deviceMap = useMemo(() => {
    const map = new Map(devices.map(d => [d.id, d]))
    for (const cp of compPrices) {
      if (cp.device && cp.device.id && !map.has(cp.device.id)) {
        map.set(cp.device.id, cp.device)
      }
    }
    return map
  }, [devices, compPrices])

  /** Device-level anchor (avg trade/sell from any storage) for deriving Our Quote when row has no competitor data */
  const deviceAnchorPrices = useMemo(() => {
    const byDevice = new Map<string, { trades: number[]; sells: number[] }>()
    for (const cp of compPrices) {
      if (normalizeStorageForKey(cp.storage) === 'UNKNOWN') continue
      const id = cp.device_id
      if (!id) continue
      if (!byDevice.has(id)) byDevice.set(id, { trades: [], sells: [] })
      const entry = byDevice.get(id)!
      if (cp.trade_in_price != null && cp.trade_in_price > 0) entry.trades.push(cp.trade_in_price)
      if (cp.sell_price != null && cp.sell_price > 0) entry.sells.push(cp.sell_price)
    }
    const result = new Map<string, { avgTrade: number; avgSell: number }>()
    Array.from(byDevice.entries()).forEach(([id, { trades, sells }]) => {
      const avgTrade = trades.length > 0 ? trades.reduce((a, b) => a + b, 0) / trades.length : 0
      const avgSell = sells.length > 0 ? sells.reduce((a, b) => a + b, 0) / sells.length : 0
      if (avgTrade > 0 || avgSell > 0) result.set(id, { avgTrade, avgSell })
    })
    return result
  }, [compPrices])
  const getDeviceLabel = (deviceId: string) => {
    const d = deviceMap.get(deviceId)
    return d ? `${d.make} ${d.model}` : deviceId.slice(0, 8) + '...'
  }

  const selectedCalcDevice = deviceMap.get(calcForm.device_id)
  const calcStorageOptions = getStorageOptionsForDevice(selectedCalcDevice)

  useEffect(() => {
    setCalcResult(null)
  }, [
    calcForm.device_id,
    calcForm.storage,
    calcForm.condition,
    calcForm.carrier,
    calcForm.risk_mode,
    calcForm.trade_in_profit_percent,
    calcForm.cpo_markup_percent,
    calcForm.enterprise_margin_percent,
    calcForm.beat_competitor_percent,
  ])

  const filteredCpDevices = useMemo(() => {
    const query = cpDeviceSearch.trim().toLowerCase()
    if (!query) return devices
    return devices.filter((device) => `${device.make} ${device.model}`.toLowerCase().includes(query))
  }, [devices, cpDeviceSearch])

  const filteredCalcDevices = useMemo(() => {
    const q = calcDeviceFilter.trim().toLowerCase()
    if (!q) return devices
    return devices.filter((d) => `${d.make} ${d.model}`.toLowerCase().includes(q))
  }, [devices, calcDeviceFilter])

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
      setFormulaPrices(new Map())
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
      setFormulaPrices(new Map())
      fetchCompetitorPrices()
    } catch {
      toast.error('Failed to delete')
    } finally { setCpDeleteTarget(null) }
  }

  const [lastScrapeResult, setLastScrapeResult] = useState<{
    total_upserted: number; devices_created: number; price_changes_count: number
    scrapers: { name: string; success: boolean; count: number; duration_ms: number }[]
    timestamp: string
  } | null>(null)

  const handleRunScraper = async () => {
    setCpScraping(true)
    setLastScrapeResult(null)
    try {
      const res = await fetch('/api/pricing/scrape', { method: 'POST' })
      const data = await readResponsePayload<{
        error?: string
        total_upserted: number
        devices_created?: number
        price_changes_count?: number
        scrapers?: { name: string; success: boolean; count: number; duration_ms: number }[]
        errors?: string[]
        timestamp: string
        training?: {
          skipped?: boolean
          reason?: string
          baselines_upserted?: number
          sample_counts?: Record<string, number>
        } | null
      }>(res)
      if (!res.ok) {
        throw new Error(data?.error || `Scraper failed (${res.status})`)
      }
      if (!data) {
        throw new Error('Scraper returned an empty response')
      }
      setLastScrapeResult({
        total_upserted: data.total_upserted,
        devices_created: data.devices_created ?? 0,
        price_changes_count: data.price_changes_count ?? 0,
        scrapers: data.scrapers || [],
        timestamp: data.timestamp,
      })
      toast.success(`Scraper complete: ${data.total_upserted} prices updated${data.devices_created ? `, ${data.devices_created} new devices` : ''}${data.price_changes_count ? `, ${data.price_changes_count} prices changed` : ''}`)
      if (data.training && 'skipped' in data.training && data.training.skipped) {
        toast.info('Scrape completed. Model training now runs separately from the Training Data tab so this action returns faster.')
      }
      if (data.errors?.length) {
        toast.warning(`${data.errors.length} warning(s) - check console`)
        console.warn('Scraper warnings:', data.errors)
      }
      setFormulaPrices(new Map())
      fetchCompetitorPrices()
      fetchDevices()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scraper failed')
    } finally { setCpScraping(false) }
  }

  const handleDownloadPriceChanges = async () => {
    try {
      const res = await fetch('/api/pricing/scrape/changes?format=csv&hours=24')
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `price-changes-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Price change report downloaded')
    } catch {
      toast.error('Failed to download price change report')
    }
  }

  const handleCleanupUnknownStorage = async () => {
    setCleanupUnknownLoading(true)
    try {
      const res = await fetch('/api/pricing/competitors/cleanup-unknown', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Cleanup failed')
      toast.success(data.message || `Removed ${data.deleted ?? 0} UNKNOWN storage entries`)
      setFormulaPrices(new Map())
      fetchCompetitorPrices()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cleanup failed')
    } finally {
      setCleanupUnknownLoading(false)
    }
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

  const buildBenchmarkRows = (targetConditions: Array<'excellent' | 'good' | 'fair' | 'broken'>) => {
    const allConditions: Array<'excellent' | 'good' | 'fair' | 'broken'> = ['excellent', 'good', 'fair', 'broken']
    const baseRows = new Map<string, { device_id: string; storage: string }>()

    for (const cp of compPrices) {
      const key = `${cp.device_id}|${cp.storage}`
      if (!baseRows.has(key)) {
        baseRows.set(key, { device_id: cp.device_id, storage: cp.storage })
      }
    }

    const byKey = new Map<string, {
      device_id: string; storage: string; condition: 'excellent' | 'good' | 'fair' | 'broken'
      prices: Record<string, number | null>; sellPrices: Record<string, number | null>
    }>()

    for (const { device_id, storage } of Array.from(baseRows.values())) {
      for (const condition of allConditions) {
        if (!targetConditions.includes(condition)) continue
        const prices: Record<string, number | null> = {}
        const sellPrices: Record<string, number | null> = {}
        for (const competitor of COMPETITOR_LIST) {
          prices[competitor] = null
          sellPrices[competitor] = null
        }
        byKey.set(`${device_id}|${storage}|${condition}`, { device_id, storage, condition, prices, sellPrices })
      }
    }

    for (const cp of compPrices) {
      const condition = (cp.condition || 'good') as 'excellent' | 'good' | 'fair' | 'broken'
      const key = `${cp.device_id}|${cp.storage}|${condition}`
      if (!byKey.has(key)) continue
      const row = byKey.get(key)!
      const name = normalizeCompetitorName(cp.competitor_name)
      if (row.prices[name] == null && cp.trade_in_price != null) row.prices[name] = cp.trade_in_price
      if (row.sellPrices[name] == null && cp.sell_price != null) row.sellPrices[name] = cp.sell_price
    }

    return Array.from(byKey.values())
  }

  const handlePreviewBenchmark = () => {
    const value = Number(benchmark.value)
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Enter a valid benchmark adjustment value')
      return
    }

    const targetConditions: Array<'excellent' | 'good' | 'fair' | 'broken'> =
      benchmark.condition === 'all'
        ? ['excellent', 'good', 'fair', 'broken']
        : [benchmark.condition]

    const sourceRows = benchmark.condition === 'all' || compConditionFilter !== 'all'
      ? buildBenchmarkRows(targetConditions)
      : competitorMatrixRows

    const preview: typeof benchmarkPreview = []

    for (const row of sourceRows) {
      if (!targetConditions.includes(row.condition)) continue

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
      toast.error('No matching prices found for the selected condition(s)')
      return
    }

    preview.sort((a, b) => {
      const deviceCmp = a.device_label.localeCompare(b.device_label)
      if (deviceCmp !== 0) return deviceCmp
      const storageCmp = a.storage.localeCompare(b.storage)
      if (storageCmp !== 0) return storageCmp
      return a.condition.localeCompare(b.condition)
    })

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
          ...(calcForm.trade_in_profit_percent !== '' && !Number.isNaN(parseFloat(calcForm.trade_in_profit_percent))
            ? { trade_in_profit_percent: parseFloat(calcForm.trade_in_profit_percent) }
            : {}),
          ...(calcForm.cpo_markup_percent !== '' && !Number.isNaN(parseFloat(calcForm.cpo_markup_percent))
            ? { cpo_markup_percent: parseFloat(calcForm.cpo_markup_percent) }
            : {}),
          ...(calcForm.risk_mode === 'enterprise' && calcForm.enterprise_margin_percent !== '' && !Number.isNaN(parseFloat(calcForm.enterprise_margin_percent))
            ? { enterprise_margin_percent: parseFloat(calcForm.enterprise_margin_percent) }
            : {}),
          ...(calcForm.beat_competitor_percent && !Number.isNaN(parseFloat(calcForm.beat_competitor_percent)) && parseFloat(calcForm.beat_competitor_percent) > 0
            ? { beat_competitor_percent: parseFloat(calcForm.beat_competitor_percent) }
            : {}),
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCalcResult(data)
    } catch {
      toast.error('Calculation failed')
    } finally { setCalculating(false) }
  }

  // CPO calculator: compute avg sell price for device+storage (no condition)
  const filteredCpoCalcDevices = useMemo(() => {
    const q = cpoCalcDeviceFilter.trim().toLowerCase()
    if (!q) return devices
    return devices.filter((d) => `${d.make} ${d.model}`.toLowerCase().includes(q))
  }, [devices, cpoCalcDeviceFilter])

  const selectedCpoCalcDevice = deviceMap.get(cpoCalcForm.device_id)
  const cpoCalcStorageOptions = getStorageOptionsForDevice(selectedCpoCalcDevice)

  const handleCpoCalculate = () => {
    if (!cpoCalcForm.device_id || !cpoCalcForm.storage) {
      toast.error('Select a device and storage')
      return
    }
    const selectedStorage = normalizeStorageOption(cpoCalcForm.storage)
    const matching = compPrices.filter(cp =>
      cp.device_id === cpoCalcForm.device_id &&
      normalizeStorageOption(cp.storage || '') === selectedStorage &&
      cp.sell_price != null && cp.sell_price > 0
    )
    const sellPrices = matching.map(cp => cp.sell_price!).filter(p => p > 0)
    if (sellPrices.length === 0) {
      toast.info('No competitor sell/CPO prices found for this device + storage. Run the scraper first.')
      setCpoCalcResult(null)
      return
    }
    const avg = sellPrices.reduce((s, p) => s + p, 0) / sellPrices.length
    const rawMarkup = parseFloat(settingsForm.cpo_markup_percent || SETTINGS_DEFAULTS.cpo_markup_percent)
    const markupPct = rawMarkup >= 1 ? rawMarkup : 18
    const ourPrice = avg * (1 + markupPct / 100)
    setCpoCalcResult({
      avgSellPrice: Math.round(avg * 100) / 100,
      ourMarkupPrice: Math.round(ourPrice * 100) / 100,
    })
  }

  // CPO Matrix: device + storage only (no condition), showing sell_price per competitor
  const cpoMatrixRows = useMemo(() => {
    const baseRows = new Map<string, { device_id: string; storage: string }>()

    for (const device of devices) {
      const storageOpts = getStorageOptionsForDevice(device)
      const storages = storageOpts.length > 0 ? storageOpts : ['128GB']
      for (const storage of storages) {
        const normStorage = normalizeStorageForKey(storage)
        const key = `${device.id}|${normStorage}`
        if (!baseRows.has(key)) {
          baseRows.set(key, { device_id: device.id, storage: normStorage })
        }
      }
    }

    // Also from competitor prices
    for (const cp of compPrices) {
      const normStorage = normalizeStorageForKey(cp.storage)
      if (normStorage === 'UNKNOWN') continue
      const key = `${cp.device_id}|${normStorage}`
      if (!baseRows.has(key)) {
        baseRows.set(key, { device_id: cp.device_id, storage: normStorage })
      }
    }

    const byKey = new Map<string, {
      device_id: string
      storage: string
      sellPrices: Record<string, number | null>
      latestRetrievedAt: string | null
    }>()

    for (const { device_id, storage } of Array.from(baseRows.values())) {
      const sellPrices: Record<string, number | null> = {}
      for (const competitor of COMPETITOR_LIST) {
        sellPrices[competitor] = null
      }
      byKey.set(`${device_id}|${storage}`, { device_id, storage, sellPrices, latestRetrievedAt: null })
    }

    for (const cp of compPrices) {
      const normStorage = normalizeStorageForKey(cp.storage)
      if (normStorage === 'UNKNOWN') continue
      const key = `${cp.device_id}|${normStorage}`
      if (!byKey.has(key)) continue
      const row = byKey.get(key)!
      const name = normalizeCompetitorName(cp.competitor_name)
      if (!(COMPETITOR_LIST as readonly string[]).includes(name)) continue
      // Take highest sell price across conditions for this device+storage
      if (cp.sell_price != null && (row.sellPrices[name] == null || cp.sell_price > row.sellPrices[name]!)) {
        row.sellPrices[name] = cp.sell_price
      }
      const retrievedAt = cp.retrieved_at || cp.scraped_at || cp.updated_at || cp.created_at || null
      if (retrievedAt && (!row.latestRetrievedAt || retrievedAt > row.latestRetrievedAt)) {
        row.latestRetrievedAt = retrievedAt
      }
    }

    // Filter: only rows with at least one sell price
    const rows = Array.from(byKey.values())
      .filter(row => COMPETITOR_LIST.some(c => (row.sellPrices[c] ?? 0) > 0))
      .sort((a, b) => {
        const deviceCmp = getDeviceLabel(a.device_id).localeCompare(getDeviceLabel(b.device_id))
        if (deviceCmp !== 0) return deviceCmp
        return a.storage.localeCompare(b.storage)
      })

    return rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compPrices, devices])

  const handleSaveSettings = async () => {
    setSettingsSaving(true)
    try {
      const res = await fetch('/api/pricing/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      })
      if (!res.ok) throw new Error()
      toast.success('Pricing settings saved — refreshing quotes…')
      // Clear cached formula prices and trigger a full re-fetch with new settings
      setFormulaPrices(new Map())
      setFormulaRefreshTrigger(t => t + 1)
      setShowQuoteRefreshBanner(true)
    } catch {
      toast.error('Failed to save settings')
    } finally { setSettingsSaving(false) }
  }

  const handleSendUpdatedQuotes = async () => {
    setSendingQuoteUpdate(true)
    try {
      const res = await fetch('/api/pricing/notify-quote-updates', { method: 'POST' })
      const data = res.ok ? await res.json() : null
      if (!res.ok) throw new Error()
      const count = data?.notified ?? 0
      toast.success(count > 0 ? `Updated quote notifications sent to ${count} customer${count !== 1 ? 's' : ''}` : 'No active orders with changed quotes')
      setShowQuoteRefreshBanner(false)
    } catch {
      toast.error('Failed to send quote update notifications')
    } finally { setSendingQuoteUpdate(false) }
  }

  const handleIntlDownloadTemplate = () => {
    const template = 'device_name,storage,trade_in_price,sell_price\niPhone 15 Pro Max,256GB,450,650\nSamsung Galaxy S24 Ultra,512GB,400,580\n'
    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'international_pricing_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleIntlUpload = async () => {
    if (!intlFile) {
      toast.error('Select a CSV file first')
      return
    }
    setIntlUploading(true)
    setIntlResult(null)
    try {
      const csvText = await intlFile.text()
      const res = await fetch('/api/pricing/competitors/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Upload failed')
        return
      }
      setIntlResult(data)
      if (data.imported > 0) {
        toast.success(`Imported ${data.imported} international prices`)
        fetchCompetitorPrices()
      } else {
        toast.warning('No prices were imported')
      }
    } catch {
      toast.error('Failed to upload international prices')
    } finally {
      setIntlUploading(false)
    }
  }

  const CORE_SETTINGS_FIELDS = [
    { key: 'trade_in_profit_percent', label: 'Target Margin (Retail %)', desc: 'Default profit target for retail quotes.' },
    { key: 'enterprise_margin_percent', label: 'Target Margin (Enterprise %)', desc: 'Default profit target for enterprise quotes.' },
    { key: 'breakage_risk_percent', label: 'Safety Deduction (%)', desc: 'Extra deduction to cover unexpected device issues.' },
    { key: 'competitive_relevance_min', label: 'Minimum Competitiveness', desc: 'How close we stay to competitor offers (0.85 = 85%).' },
    { key: 'competitor_ceiling_percent', label: 'Max Above Competitor (%)', desc: 'Maximum percent we allow above top competitor offer.' },
    { key: 'beat_competitor_percent', label: 'Beat Competitors (%)', desc: 'Offer X% above highest competitor to win deals (0 = off, 2–5 = aggressive).' },
    { key: 'beat_competitor_amount', label: 'Trade-In Beat Amount ($)', desc: 'How many $ above the highest competitor trade-in price we offer. Default $12.' },
    { key: 'cpo_beat_amount', label: 'CPO Beat Amount ($)', desc: 'How many $ above the highest competitor CPO sell price we list at. Default $10.' },
    { key: 'price_staleness_days', label: 'Price Refresh Reminder (days)', desc: 'Warn admins when competitor data is old.' },
  ] as const

  const ADVANCED_SETTINGS_FIELDS = [
    { key: 'channel_green_min', label: 'Auto Route: Strong Margin Threshold', desc: 'Above this, route to direct wholesale.' },
    { key: 'channel_yellow_min', label: 'Auto Route: Medium Margin Threshold', desc: 'Between medium and strong, use mixed routing logic.' },
    { key: 'outlier_deviation_threshold', label: 'Outlier Alert Threshold', desc: 'Flag quotes that deviate from recent sales by this ratio.' },
    { key: 'cpo_markup_percent', label: 'CPO Markup (Retail %)', desc: 'Markup added to C-stock for retail CPO price.' },
    { key: 'cpo_enterprise_markup_percent', label: 'CPO Markup (Enterprise %)', desc: 'Markup added to C-stock for enterprise CPO price.' },
  ] as const

  // Filter competitor prices (exclude UNKNOWN storage)
  const filteredComp = compPrices.filter(cp => {
    const normStorage = normalizeStorageForKey(cp.storage)
    if (normStorage === 'UNKNOWN') return false

    const matchesCondition = compConditionFilter === 'all' || (cp.condition || 'good') === compConditionFilter
    if (!matchesCondition) return false

    const matchesCompetitor = compCompetitorFilter === 'all' ||
      normalizeCompetitorName(cp.competitor_name || '') === compCompetitorFilter
    if (!matchesCompetitor) return false

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
        marketRefPrice: undefined as number | undefined,
        goRecellGoodPrice: undefined as number | undefined,
        competitorCount: 0,
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
        marketRefPrice: undefined as number | undefined,
        goRecellGoodPrice: undefined as number | undefined,
        competitorCount: 0,
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

    const tradeInPolicyReference = buildTradeInPolicyReference(rows)
    const highestPrice = tradeInPolicyReference.highestPrice
    const averagePrice = tradeInPolicyReference.averagePrice

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

    const marketRefPrice = tradeInPolicyReference.referencePrice
    const goRecellGoodPrice = tradeInPolicyReference.goRecellPrice

    return {
      rows,
      condition,
      usedConditionFallback,
      highestPrice,
      averagePrice,
      averageSellPrice,
      highestSellPrice,
      latestRetrievedAt,
      marketRefPrice: marketRefPrice ?? undefined,
      goRecellGoodPrice,
      competitorCount: tradeInPolicyReference.canonicalRows.length,
    }
  })()

  // Competitor matrix computation — full device coverage: all devices from catalog + all competitors
  const { competitorMatrixRows, emptyRowKeys } = (() => {
    const allConditions: Array<'excellent' | 'good' | 'fair' | 'broken'> = ['excellent', 'good', 'fair', 'broken']

    const baseRows = new Map<string, {
      device_id: string
      storage: string
    }>()

    // Include all devices from catalog with their storage options (full device coverage)
    for (const device of devices) {
      const storageOpts = getStorageOptionsForDevice(device)
      const storages = storageOpts.length > 0 ? storageOpts : ['128GB']
      for (const storage of storages) {
        const normStorage = normalizeStorageForKey(storage)
        const key = `${device.id}|${normStorage}`
        if (!baseRows.has(key)) {
          baseRows.set(key, { device_id: device.id, storage: normStorage })
        }
      }
    }

    // Also include any device+storage from competitor prices (normalize to match e.g. "256 GB" -> "256GB")
    // Exclude UNKNOWN storage — not a real variant
    for (const cp of filteredComp) {
      const normStorage = normalizeStorageForKey(cp.storage)
      if (normStorage === 'UNKNOWN') continue
      const key = `${cp.device_id}|${normStorage}`
      if (!baseRows.has(key)) {
        baseRows.set(key, { device_id: cp.device_id, storage: normStorage })
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
      const normStorage = normalizeStorageForKey(cp.storage)
      const key = `${cp.device_id}|${normStorage}|${condition}`

      if (!byKey.has(key)) continue

      const row = byKey.get(key)!
      const canonicalCompetitorName = normalizeCompetitorName(cp.competitor_name)
      if (!(COMPETITOR_LIST as readonly string[]).includes(canonicalCompetitorName)) continue
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

    const rows = Array.from(byKey.values())
      .filter(row => {
        if (compCompetitorFilter !== 'all') {
          const hasForComp = (row.prices[compCompetitorFilter] != null && row.prices[compCompetitorFilter]! > 0)
            || (row.sellPrices[compCompetitorFilter] != null && row.sellPrices[compCompetitorFilter]! > 0)
          return hasForComp
        }
        // When showing all competitors: only show rows that have at least one competitor price (device prices from comp not empty)
        const priceSource = priceMode === 'trade_in' ? row.prices : row.sellPrices
        return COMPETITOR_LIST.some(c => (priceSource[c] ?? 0) > 0)
      })
      .sort((a, b) => {
        const deviceCmp = getDeviceLabel(a.device_id).localeCompare(getDeviceLabel(b.device_id))
        if (deviceCmp !== 0) return deviceCmp
        const storageCmp = a.storage.localeCompare(b.storage)
        if (storageCmp !== 0) return storageCmp
        return a.condition.localeCompare(b.condition)
      })
    // Send ALL matrix rows to calculate-batch so "Our Quote" always comes from the backend
    // (not a client-side approximation). Rows with competitor data get a verified API quote;
    // rows without get a formula-derived fallback.
    const allMatrixRowKeys = rows
      .slice(0, 80)
      .map(row => ({ key: `${row.device_id}|${row.storage}|${row.condition}`, device_id: row.device_id, storage: row.storage, condition: row.condition }))
    return { competitorMatrixRows: rows, emptyRowKeys: allMatrixRowKeys }
  })()

  const emptyRowKeysStr = emptyRowKeys.map(e => e.key).join('|')
  // Fetch backend-computed prices for all matrix rows so "Our Quote" is always backend-authoritative
  useEffect(() => {
    if (emptyRowKeys.length === 0 || cpLoading) return
    const toFetch = emptyRowKeys.filter(item => !formulaPrices.has(item.key))
    if (toFetch.length === 0) return
    const controller = new AbortController()
    setFormulaLoading(true)
    fetch('/api/pricing/calculate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: toFetch, price_mode: priceMode }),
      signal: controller.signal,
    })
      .then(r => {
        if (!r.ok) throw new Error('Failed')
        return r.json()
      })
      .then(data => {
        const results = data.data || []
        const added = results.filter((item: { trade_price?: number; cpo_price?: number; error?: string }) => item.trade_price != null && item.cpo_price != null && !item.error).length
        setFormulaPrices(prev => {
          const next = new Map(prev)
          for (const item of results) {
            if (item.trade_price != null && item.cpo_price != null && !item.error) {
              next.set(item.key, { trade_price: item.trade_price, cpo_price: item.cpo_price })
            }
          }
          return next
        })
        if (added > 0) toast.success(`${added} formula prices loaded for empty cells`)
      })
      .catch((err) => { if (err?.name !== 'AbortError') toast.error('Could not load formula prices for empty cells. Check that devices have market or competitor data.') })
      .finally(() => setFormulaLoading(false))
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- formulaPrices intentionally omitted (functional setState)
  }, [emptyRowKeysStr, priceMode, cpLoading, formulaRefreshTrigger])

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Pricing Control"
        title="A pricing studio that feels operational, not spreadsheet-bound."
        description="Manage trade-in logic, CPO markup, international uploads, training data, and system-wide pricing behavior from one control layer."
        stats={[
          { label: 'Catalog devices', value: catalogLoading ? 'Loading...' : (catalogData?.summary.total_devices ?? devices.length) },
          { label: 'Competitor rows', value: catalogLoading ? 'Loading...' : (catalogData?.summary.total_competitor_entries ?? compPrices.length) },
          { label: 'Training mode', value: settingsLoading ? 'Loading...' : (settingsForm.prefer_data_driven === 'true' ? 'Data-driven' : 'Formula-first') },
          { label: 'Scraper status', value: cpScraping ? 'Running' : 'Ready' },
        ]}
      />

      {showQuoteRefreshBanner && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <Zap className="h-4 w-4 shrink-0" />
            <span>Pricing settings updated — quotes have been recalculated. Send updated quote notifications to customers with active orders?</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuoteRefreshBanner(false)}>Dismiss</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSendUpdatedQuotes} disabled={sendingQuoteUpdate}>
              {sendingQuoteUpdate ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Sending…</> : 'Send Updated Quotes'}
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="trade-in">
        <TabsList className="flex h-auto w-full flex-wrap items-center justify-start gap-1 bg-white/[0.035]">
          <TabsTrigger value="trade-in"><TrendingUp className="mr-1.5 h-3.5 w-3.5" />Trade-In Pricing</TabsTrigger>
          <TabsTrigger value="cpo"><ShoppingBag className="mr-1.5 h-3.5 w-3.5" />CPO Pricing</TabsTrigger>
          <TabsTrigger value="international"><Globe className="mr-1.5 h-3.5 w-3.5" />International</TabsTrigger>
          <TabsTrigger value="training"><Database className="mr-1.5 h-3.5 w-3.5" />Training Data</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="mr-1.5 h-3.5 w-3.5" />Settings</TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* TAB 1: TRADE-IN PRICING */}
        {/* ============================================================ */}
        <TabsContent value="trade-in" className="space-y-4 mt-4">
          {/* How Trade-In Pricing Works */}
          <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                How Trade-In Pricing Works
              </CardTitle>
              <CardDescription className="text-stone-400">Our pricing engine uses competitor market data to automatically generate optimal trade-in prices.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.035] p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold">1</div>
                    <h4 className="text-sm font-semibold">Scrape Competitors</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Daily scrape of trade-in offers from <strong>Telus</strong>, <strong>Bell</strong>, and <strong>GoRecell</strong>. Apple and UniverCell stay visible as reference data.
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.035] p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold">2</div>
                    <h4 className="text-sm font-semibold">Calculate Average</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    For each device + storage + condition, we compute the <strong>Bell/Telus average</strong> first, then compare it with <strong>GoRecell</strong>.
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.035] p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold">3</div>
                    <h4 className="text-sm font-semibold">Final Quote</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Our Quote = Average( Bell/Telus Avg, GoRecell )</strong>
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-[1.25rem] border border-white/8 bg-white/[0.035] p-4">
                <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Trade-In Formula:</span>{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      Our Quote = ((Bell + Telus) / 2 + GoRecell) / 2
                    </code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Reference-only competitors:</span>{' '}
                    <span>Apple Trade-In, UniverCell</span>
                  </div>
                  <div className="w-full">
                    <span className="text-muted-foreground font-medium">Condition Multipliers:</span>
                    <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {(['excellent', 'good', 'fair', 'broken'] as const).map(c => (
                        <div key={c} className="rounded bg-muted/60 px-2 py-1.5 font-mono">
                          <span className="capitalize text-foreground">{c}</span>: {(CONDITION_MULT_FOR_QUOTE[c] ?? 0.85) * 100}%
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Quick-edit trade-in margin */}
                <div className="mt-4 pt-4 border-t flex flex-wrap items-end gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="quick-trade-in-pct" className="text-xs whitespace-nowrap">Trade-In margin (%):</Label>
                    <Input
                      id="quick-trade-in-pct"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      className="w-20 h-8 text-sm"
                      value={settingsForm.trade_in_profit_percent ?? '20'}
                      onChange={e => setSettingsForm(prev => ({ ...prev, trade_in_profit_percent: e.target.value }))}
                      placeholder="20"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleSaveSettings}
                    disabled={settingsSaving}
                    className="h-8"
                  >
                    {settingsSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trade-In Competitor Matrix */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:flex-wrap">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
              <div className="relative w-full sm:w-72">
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
              <Select value={compCompetitorFilter} onValueChange={v => setCompCompetitorFilter(v)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Competitors</SelectItem>
                  {COMPETITOR_LIST.map(c => (
                    <SelectItem key={c} value={c}>{COMPETITOR_DISPLAY_NAMES[c] || c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleRunScraper} disabled={cpScraping}>
                <RefreshCw className={`mr-2 h-4 w-4 ${cpScraping ? 'animate-spin' : ''}`} />
                {cpScraping ? 'Scraping...' : 'Run Scraper'}
              </Button>
              <Button variant="outline" onClick={handleDownloadPriceChanges}>
                <FileDown className="mr-2 h-4 w-4" />Price Changes
              </Button>
              <Button variant="outline" onClick={() => handleExportCompetitors('excel')}>
                <FileDown className="mr-2 h-4 w-4" />Excel
              </Button>
              <Button onClick={() => setCpDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />Add Price
              </Button>
              <Button variant="outline" onClick={handleCleanupUnknownStorage} disabled={cleanupUnknownLoading} title="Remove UNKNOWN storage entries">
                <Trash2 className="mr-2 h-4 w-4" />
                {cleanupUnknownLoading ? 'Cleaning...' : 'Remove UNKNOWN'}
              </Button>
            </div>
          </div>

          {/* Last Scrape Results */}
          {lastScrapeResult && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-sm">
                      <span className="font-medium text-green-600">Scrape Complete</span>
                      <span className="text-muted-foreground ml-2">
                        {lastScrapeResult.total_upserted} prices upserted
                        {lastScrapeResult.devices_created > 0 && ` / ${lastScrapeResult.devices_created} new devices`}
                        {lastScrapeResult.price_changes_count > 0 && (
                          <span className="font-semibold text-amber-600"> / {lastScrapeResult.price_changes_count} prices changed</span>
                        )}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {lastScrapeResult.scrapers.map(s => (
                        <Badge key={s.name} variant={s.success ? 'secondary' : 'destructive'} className="text-[10px]">
                          {s.name}: {s.count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {lastScrapeResult.price_changes_count > 0 && (
                    <Button variant="outline" size="sm" onClick={handleDownloadPriceChanges}>
                      <FileDown className="mr-1.5 h-3.5 w-3.5" />
                      Download Changes CSV
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">
                  Competitor Trade-In Prices ({competitorMatrixRows.length} rows)
                </CardTitle>
                {emptyRowKeys.length > 0 && compCompetitorFilter === 'all' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setFormulaPrices(new Map()); setFormulaRefreshTrigger(t => t + 1) }}
                    disabled={formulaLoading}
                  >
                    {formulaLoading ? 'Loading formula prices...' : `Load formula prices (${emptyRowKeys.length} empty)`}
                  </Button>
                )}
              </div>
              <CardDescription>
                Side-by-side trade-in price comparison across all competitors — what competitors offer customers for trade-in
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cpLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              ) : competitorMatrixRows.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <TrendingUp className="h-10 w-10 mb-3 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No competitor prices match filters</p>
                  <p className="text-xs mt-1 mb-3">
                    {compPrices.length === 0
                      ? 'The competitor prices table is empty. Run the scraper to fetch live prices from Telus, Bell, GoRecell, UniverCell, and Apple Trade-In.'
                      : 'No prices match the current filters. Try clearing the competitor or condition filter.'}
                  </p>
                  {compPrices.length === 0 && (
                    <Button size="sm" onClick={handleRunScraper} disabled={cpScraping}>
                      <RefreshCw className={`mr-2 h-3.5 w-3.5 ${cpScraping ? 'animate-spin' : ''}`} />
                      {cpScraping ? 'Scraping...' : 'Run Scraper Now'}
                    </Button>
                  )}
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
                          <TableHead key={c} className="text-right">{COMPETITOR_DISPLAY_NAMES[c] || c}</TableHead>
                        ))}
                        <TableHead className="text-right">Policy Ref</TableHead>
                        <TableHead className="text-right font-semibold text-primary">Our Quote</TableHead>
                        <TableHead className="text-right text-xs text-muted-foreground">Last Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {competitorMatrixRows.map((row) => {
                        const policyReference = buildTradeInPolicyReference(
                          COMPETITOR_LIST.map((competitor) => ({
                            name: competitor,
                            price: row.prices[competitor],
                          }))
                        )
                        const tradeValues = COMPETITOR_LIST
                          .map(c => row.prices[c])
                          .filter((p): p is number => p != null && p > 0)
                        const highestPrice = tradeValues.length > 0 ? Math.max(...tradeValues) : null

                        return (
                          <TableRow key={`${row.device_id}-${row.storage}-${row.condition}`}>
                            <TableCell className="font-medium">{getDeviceLabel(row.device_id)}</TableCell>
                            <TableCell>{row.storage}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize">{row.condition}</Badge>
                            </TableCell>
                            {COMPETITOR_LIST.map(c => {
                              const price = row.prices[c]
                              const isHighest = price != null && price === highestPrice && tradeValues.length > 1
                              return (
                                <TableCell
                                  key={`${row.device_id}-${row.storage}-${row.condition}-${c}`}
                                  className={`text-right font-mono ${isHighest ? 'text-green-600 font-semibold' : ''}`}
                                  title={row.retrievedAtByCompetitor[c] ? `Retrieved: ${formatDateTime(row.retrievedAtByCompetitor[c] as string)}` : 'No data'}
                                >
                                  {price != null ? formatCurrency(price) : <span className="text-muted-foreground">-</span>}
                                </TableCell>
                              )
                            })}
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {policyReference.referencePrice != null ? formatCurrency(policyReference.referencePrice) : (formulaLoading ? '...' : '-')}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-primary" title="Backend-computed Bell/Telus + GoRecell quote">
                              {(() => {
                                const key = `${row.device_id}|${row.storage}|${row.condition}`
                                // Always prefer backend API result (calculate-batch) — single source of truth
                                const fp = formulaPrices.get(key)
                                if (fp) {
                                  return fp.trade_price != null && fp.trade_price > 0 ? formatCurrency(fp.trade_price) : '-'
                                }
                                if (formulaLoading) return <span className="text-muted-foreground text-xs">...</span>
                                // Fallback while batch loads: same policy formula as the backend
                                if (policyReference.referencePrice != null) {
                                  return formatCurrency(policyReference.referencePrice)
                                }
                                return '-'
                              })()}
                            </TableCell>
                            <TableCell className="text-right">
                              {row.latestRetrievedAt ? (
                                <div className="text-right">
                                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                                    {formatDateTime(row.latestRetrievedAt)}
                                  </div>
                                  {(() => {
                                    const daysAgo = Math.floor((Date.now() - new Date(row.latestRetrievedAt).getTime()) / (24 * 60 * 60 * 1000))
                                    return daysAgo > 14 ? (
                                      <Badge variant="destructive" className="text-[10px] mt-0.5">Stale</Badge>
                                    ) : null
                                  })()}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
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

          {/* Bulk Pricing Adjustment Tool */}
          <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Bulk Pricing Adjustment (Trade-In)
              </CardTitle>
              <CardDescription>
                Adjust trade-in prices across {benchmark.condition === 'all' ? 'all devices in every condition' : `all "${benchmark.condition}" devices`} based on competitor averages. Applied prices are used system-wide for quotes, orders, and the pricing API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Condition</Label>
                  <Select value={benchmark.condition} onValueChange={v => setBenchmark(prev => ({ ...prev, condition: v as 'all' | 'excellent' | 'good' | 'fair' | 'broken' }))}>
                    <SelectTrigger><SelectValue placeholder="Condition" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Conditions</SelectItem>
                      <SelectItem value="excellent">Excellent</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="broken">Broken</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Adjustment Type</Label>
                  <Select value={benchmark.adjustment_type} onValueChange={v => setBenchmark(prev => ({ ...prev, adjustment_type: v as 'percent' | 'fixed' }))}>
                    <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                      <SelectItem value="percent">Percentage (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Direction & Value</Label>
                  <div className="flex gap-2">
                    <Select value={benchmark.direction} onValueChange={v => setBenchmark(prev => ({ ...prev, direction: v as 'increase' | 'decrease' }))}>
                      <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="increase">+ Add</SelectItem>
                        <SelectItem value="decrease">- Subtract</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={benchmark.value}
                      onChange={e => setBenchmark(prev => ({ ...prev, value: e.target.value }))}
                      placeholder={benchmark.adjustment_type === 'percent' ? 'e.g. 10' : 'e.g. 5'}
                    />
                  </div>
                </div>
                <div className="flex items-end">
                  <Button onClick={handlePreviewBenchmark} disabled={benchmarkApplying} className="w-full">
                    Preview & Apply
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trade-In Calculator */}
          <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Trade-In Price Calculator
              </CardTitle>
              <CardDescription>Select device, storage, and condition to calculate the trade-in price we offer customers.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Device</Label>
                  <div className="space-y-1.5">
                    <Input
                      placeholder="Search devices..."
                      value={calcDeviceFilter}
                      onChange={e => setCalcDeviceFilter(e.target.value)}
                      className="h-9 text-sm"
                    />
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
                      <SelectTrigger><SelectValue placeholder={devices.length ? 'Select device' : 'Loading...'} /></SelectTrigger>
                      <SelectContent>
                        {filteredCalcDevices.length === 0 ? (
                          <div className="py-6 px-4 text-center text-sm text-muted-foreground">
                            {calcDeviceFilter ? `No devices matching "${calcDeviceFilter}"` : 'No devices in catalog'}
                          </div>
                        ) : (
                          filteredCalcDevices.slice(0, 200).map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.make} {d.model}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
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
                <div className="flex items-end">
                  <Button onClick={handleCalculate} disabled={calculating} className="w-full">
                    <Calculator className="mr-2 h-4 w-4" />
                    {calculating ? 'Calculating...' : 'Calculate'}
                  </Button>
                </div>
              </div>

              {/* Risk mode & formula overrides */}
              <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium mb-3">Risk mode & formula overrides (optional)</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Risk Mode</Label>
                    <Select value={calcForm.risk_mode} onValueChange={v => { setCalcForm(f => ({ ...f, risk_mode: v as 'retail' | 'enterprise' })); setCalcResult(null) }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retail">Retail ({settingsForm.trade_in_profit_percent || '20'}%)</SelectItem>
                        <SelectItem value="enterprise">Enterprise ({settingsForm.enterprise_margin_percent || '12'}%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="calc-trade-in-margin">
                      {calcForm.risk_mode === 'retail' ? 'Trade-in margin (%)' : 'Enterprise margin (%)'}
                    </Label>
                    <Input
                      id="calc-trade-in-margin"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      placeholder={calcForm.risk_mode === 'enterprise' ? (settingsForm.enterprise_margin_percent || '12') : (settingsForm.trade_in_profit_percent || '20')}
                      value={calcForm.risk_mode === 'enterprise' ? calcForm.enterprise_margin_percent : calcForm.trade_in_profit_percent}
                      onChange={e => setCalcForm(f => ({
                        ...f,
                        ...(calcForm.risk_mode === 'enterprise' ? { enterprise_margin_percent: e.target.value } : { trade_in_profit_percent: e.target.value }),
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="calc-beat">Beat competitors (%)</Label>
                    <Input
                      id="calc-beat"
                      type="number"
                      min="0"
                      max="20"
                      step="0.5"
                      placeholder={settingsForm.beat_competitor_percent || '0'}
                      value={calcForm.beat_competitor_percent}
                      onChange={e => setCalcForm(f => ({ ...f, beat_competitor_percent: e.target.value }))}
                    />
                  </div>
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
                    {calculatorCompetitorSnapshot.rows.every(r => r.price == null) ? (
                      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        No competitor prices found. Run the scraper to fetch prices.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          {calculatorCompetitorSnapshot.highestPrice != null && (
                            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                              Highest pricing-source offer: <span className="font-mono font-medium">{formatCurrency(calculatorCompetitorSnapshot.highestPrice)}</span>
                            </div>
                          )}
                          {calculatorCompetitorSnapshot.averagePrice != null && (
                            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs">
                              Bell/Telus/GoRecell avg: <span className="font-mono font-medium text-blue-600">{formatCurrency(calculatorCompetitorSnapshot.averagePrice)}</span>
                            </div>
                          )}
                        </div>
                        {calculatorCompetitorSnapshot.marketRefPrice != null && (
                          <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-3 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-amber-700 dark:text-amber-400">Policy Reference Price</p>
                                <p className="text-muted-foreground mt-0.5">Average the Bell/Telus midpoint with GoRecell</p>
                              </div>
                              <span className="font-mono text-base font-bold text-amber-700 dark:text-amber-400">
                                {formatCurrency(calculatorCompetitorSnapshot.marketRefPrice)}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1 border-t border-amber-200/40 dark:border-amber-800/40">
                              {calculatorCompetitorSnapshot.rows.filter(r => r.price != null && r.price > 0).map((row) => {
                                const canonicalName = normalizeCompetitorName(row.name)
                                const isPricingDriver = ['Bell', 'Telus', 'GoRecell'].includes(canonicalName)
                                return (
                                  <div key={row.name} className="rounded bg-white/50 dark:bg-white/5 px-2 py-1.5 text-center relative">
                                    {isPricingDriver && (
                                      <span className="absolute -top-1.5 right-1 text-[8px] bg-amber-500 text-white rounded px-1 leading-tight">used</span>
                                    )}
                                    <p className="text-[10px] text-muted-foreground truncate">{row.name}</p>
                                    <p className="font-mono font-semibold text-amber-700 dark:text-amber-400">{formatCurrency(row.price!)}</p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        <div className="space-y-1">
                          {calculatorCompetitorSnapshot.rows.map((row) => (
                            <div key={row.name} className="flex items-center justify-between rounded-md border px-3 py-2">
                              <span className="text-muted-foreground">{row.name}</span>
                              <div className="font-mono text-blue-600">{row.price != null ? formatCurrency(row.price) : '-'}</div>
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
                          {calcResult.error || 'No market data found'}
                        </p>
                      </div>
                      {calculatorCompetitorSnapshot.averagePrice != null && (() => {
                        const suggestedTradeIn = calculatorCompetitorSnapshot.marketRefPrice ?? calculatorCompetitorSnapshot.averagePrice
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="rounded-xl border p-5">
                              <p className="text-sm text-muted-foreground">Suggested Trade-In Price</p>
                              <p className="text-2xl font-bold text-blue-600 mt-1">
                                {formatCurrency(suggestedTradeIn)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Bell/Telus midpoint blended with GoRecell
                              </p>
                            </div>
                            {calculatorCompetitorSnapshot.highestPrice != null && (
                              <div className="rounded-xl border p-5">
                                <p className="text-sm text-muted-foreground">Highest Competitor Offer</p>
                                <p className="text-2xl font-bold text-amber-600 mt-1">
                                  {formatCurrency(calculatorCompetitorSnapshot.highestPrice)}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <>
                      {calcResult.data_staleness_warning && (
                        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                          {calcResult.data_staleness_warning}
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="rounded-xl border p-5">
                          <p className="text-sm text-muted-foreground">Trade-In Unit Price</p>
                          <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(calcResult.trade_price)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">What we offer per device</p>
                        </div>
                        <div className="rounded-xl border p-5">
                          <p className="text-sm text-muted-foreground">CPO Unit Price</p>
                          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(calcResult.cpo_price)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Certified resale price</p>
                        </div>
                        <div className="rounded-xl border p-5">
                          <p className="text-sm text-muted-foreground">Channel</p>
                          {(() => {
                            const tier = calcResult.channel_decision.margin_tier
                            const config = MARGIN_TIER_CONFIG[tier]
                            const achievedMarginPercent = Math.round(calcResult.channel_decision.margin_percent * 100)
                            return (
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-sm font-semibold ${config.bgColor} ${config.color}`}>
                                  {achievedMarginPercent}%
                                </span>
                                <span className="font-bold capitalize">{calcResult.channel_decision.recommended_channel}</span>
                              </div>
                            )
                          })()}
                        </div>
                      </div>

                      {/* Breakdown */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                              <div className="border-t pt-2">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Repair Buffer</span>
                                  <span className={`font-mono ${calcResult.repair_buffer > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatCurrency(calcResult.repair_buffer)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>

                      {/* Confidence */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                        <span>Confidence:</span>
                        <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${calcResult.confidence * 100}%` }} />
                        </div>
                        <span>{Math.round(calcResult.confidence * 100)}%</span>
                        {calcResult.price_source && (
                          <Badge variant="outline" className="ml-2 text-xs">{calcResult.price_source}</Badge>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 2: CPO PRICING */}
        {/* ============================================================ */}
        <TabsContent value="cpo" className="space-y-4 mt-4">
          {/* How CPO Pricing Works */}
          <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                How CPO Pricing Works
              </CardTitle>
              <CardDescription className="text-stone-400">Certified Pre-Owned pricing: all CPO devices are &quot;certified&quot; condition. No condition selector needed.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.035] p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white text-xs font-bold">1</div>
                    <h4 className="text-sm font-semibold">Competitor Sell Prices</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    We track what competitors <strong>sell</strong> certified devices for across all storage options.
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.035] p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white text-xs font-bold">2</div>
                    <h4 className="text-sm font-semibold">Add Markup</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>Our CPO Price = Avg Sell x (1 + {parseFloat(settingsForm.cpo_markup_percent || '18') >= 1 ? settingsForm.cpo_markup_percent : '18'}%)</strong>
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.035] p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white text-xs font-bold">3</div>
                    <h4 className="text-sm font-semibold">Depreciation</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Buyback value depreciates {settingsForm.cpo_depreciation_rate || '15'}% per year over {settingsForm.cpo_buyback_years || '3'} years.
                  </p>
                </div>
              </div>
              {/* Quick-edit CPO markup */}
              <div className="mt-4 rounded-[1.25rem] border border-white/8 bg-white/[0.035] p-4 flex flex-wrap items-end gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="quick-cpo-pct" className="text-xs whitespace-nowrap">CPO markup (%):</Label>
                  <Input
                    id="quick-cpo-pct"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    className="w-20 h-8 text-sm"
                    value={settingsForm.cpo_markup_percent ?? '18'}
                    onChange={e => setSettingsForm(prev => ({ ...prev, cpo_markup_percent: e.target.value }))}
                    placeholder="18"
                  />
                  <span className="text-xs text-muted-foreground">Our CPO Price = Avg x (1 + %)</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleSaveSettings}
                  disabled={settingsSaving}
                  className="h-8"
                >
                  {settingsSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* CPO Competitor Sell Price Matrix */}
          <Card className="surface-panel border-white/8 bg-transparent text-stone-100">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    Competitor CPO / Sell Prices ({cpoMatrixRows.length} devices)
                  </CardTitle>
                  <CardDescription>
                    What competitors sell certified devices for -- no condition column (all CPO = certified)
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleRunScraper}
                  disabled={cpScraping}
                  className="shrink-0"
                >
                  {cpScraping ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  {cpScraping ? 'Scraping CPO...' : 'Run CPO Scraper'}
                </Button>
              </div>
              {lastScrapeResult && (
                <p className="text-xs text-muted-foreground">
                  Last scrape: {lastScrapeResult.total_upserted} prices updated
                  {lastScrapeResult.devices_created > 0 ? `, ${lastScrapeResult.devices_created} new devices` : ''}
                  {lastScrapeResult.price_changes_count > 0 ? `, ${lastScrapeResult.price_changes_count} prices changed` : ''}
                  {' '}· {formatDateTime(lastScrapeResult.timestamp)}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {cpLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              ) : cpoMatrixRows.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <ShoppingBag className="h-10 w-10 mb-3 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No CPO/sell prices available</p>
                  <p className="text-xs mt-1 mb-3">Run the price scraper to fetch sell prices from Telus, Bell, GoRecell, UniverCell, and Apple.</p>
                  <Button size="sm" onClick={handleRunScraper} disabled={cpScraping}>
                    <RefreshCw className={`mr-2 h-3.5 w-3.5 ${cpScraping ? 'animate-spin' : ''}`} />
                    {cpScraping ? 'Scraping...' : 'Run Scraper Now'}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device</TableHead>
                        <TableHead>Storage</TableHead>
                        {COMPETITOR_LIST.map(c => (
                          <TableHead key={c} className="text-right">{COMPETITOR_DISPLAY_NAMES[c] || c}</TableHead>
                        ))}
                        <TableHead className="text-right">Avg Sell</TableHead>
                        <TableHead className="text-right font-semibold text-green-600">Our CPO Price</TableHead>
                        <TableHead className="text-right text-xs text-muted-foreground">Last Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cpoMatrixRows.map((row) => {
                        const sellValues = COMPETITOR_LIST
                          .map(c => row.sellPrices[c])
                          .filter((p): p is number => p != null && p > 0)
                        const avg = sellValues.length > 0
                          ? sellValues.reduce((s, p) => s + p, 0) / sellValues.length
                          : null
                        const highestPrice = sellValues.length > 0 ? Math.max(...sellValues) : null

                        const rawMarkup = parseFloat(settingsForm.cpo_markup_percent || '0')
                        const markupPct = rawMarkup >= 1 ? rawMarkup : 18
                        const ourCpoPrice = avg != null ? avg * (1 + markupPct / 100) : null

                        return (
                          <TableRow key={`cpo-${row.device_id}-${row.storage}`}>
                            <TableCell className="font-medium">{getDeviceLabel(row.device_id)}</TableCell>
                            <TableCell>{row.storage}</TableCell>
                            {COMPETITOR_LIST.map(c => {
                              const price = row.sellPrices[c]
                              const isHighest = price != null && price === highestPrice && sellValues.length > 1
                              return (
                                <TableCell
                                  key={`cpo-${row.device_id}-${row.storage}-${c}`}
                                  className={`text-right font-mono ${isHighest ? 'text-green-600 font-semibold' : ''}`}
                                >
                                  {price != null ? formatCurrency(price) : <span className="text-muted-foreground">-</span>}
                                </TableCell>
                              )
                            })}
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {avg != null ? formatCurrency(avg) : '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-green-600">
                              {ourCpoPrice != null ? formatCurrency(ourCpoPrice) : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {row.latestRetrievedAt ? (
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDateTime(row.latestRetrievedAt)}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
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

          {/* CPO Calculator */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                CPO Price Calculator
              </CardTitle>
              <CardDescription>Select device and storage only (no condition -- CPO devices are all certified).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Device</Label>
                  <div className="space-y-1.5">
                    <Input
                      placeholder="Search devices..."
                      value={cpoCalcDeviceFilter}
                      onChange={e => setCpoCalcDeviceFilter(e.target.value)}
                      className="h-9 text-sm"
                    />
                    <Select
                      value={cpoCalcForm.device_id}
                      onValueChange={(v) => {
                        const selected = deviceMap.get(v)
                        const options = getStorageOptionsForDevice(selected)
                        const nextStorage = options.includes('128GB') ? '128GB' : (options[0] || '')
                        setCpoCalcForm({ device_id: v, storage: nextStorage })
                        setCpoCalcResult(null)
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder={devices.length ? 'Select device' : 'Loading...'} /></SelectTrigger>
                      <SelectContent>
                        {filteredCpoCalcDevices.length === 0 ? (
                          <div className="py-6 px-4 text-center text-sm text-muted-foreground">
                            {cpoCalcDeviceFilter ? `No devices matching "${cpoCalcDeviceFilter}"` : 'No devices'}
                          </div>
                        ) : (
                          filteredCpoCalcDevices.slice(0, 200).map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.make} {d.model}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Storage</Label>
                  <Select
                    value={cpoCalcForm.storage}
                    onValueChange={v => { setCpoCalcForm(f => ({ ...f, storage: v })); setCpoCalcResult(null) }}
                    disabled={!cpoCalcForm.device_id || cpoCalcStorageOptions.length === 0}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {cpoCalcStorageOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleCpoCalculate} className="w-full">
                    <Calculator className="mr-2 h-4 w-4" />
                    Calculate CPO Price
                  </Button>
                </div>
              </div>

              {cpoCalcResult && (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border p-5">
                    <p className="text-sm text-muted-foreground">Avg Competitor Sell Price</p>
                    <p className="text-2xl font-bold text-muted-foreground mt-1">{formatCurrency(cpoCalcResult.avgSellPrice)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Average across all competitors</p>
                  </div>
                  <div className="rounded-xl border p-5 border-green-500/30">
                    <p className="text-sm text-muted-foreground">Our CPO Price</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(cpoCalcResult.ourMarkupPrice)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Avg + {parseFloat(settingsForm.cpo_markup_percent || '18') >= 1 ? settingsForm.cpo_markup_percent : '18'}% markup
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vendor Margin Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                CPO Margin Settings
              </CardTitle>
              <CardDescription>Configure markup percentages for CPO pricing.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="cpo-retail-markup" className="text-sm">CPO Markup - Retail (%)</Label>
                  <Input
                    id="cpo-retail-markup"
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={settingsForm.cpo_markup_percent ?? SETTINGS_DEFAULTS.cpo_markup_percent}
                    onChange={e => setSettingsForm(prev => ({ ...prev, cpo_markup_percent: e.target.value }))}
                    placeholder="18"
                  />
                  <p className="text-xs text-muted-foreground">Markup for retail CPO price.</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cpo-enterprise-markup" className="text-sm">CPO Markup - Enterprise (%)</Label>
                  <Input
                    id="cpo-enterprise-markup"
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={settingsForm.cpo_enterprise_markup_percent ?? SETTINGS_DEFAULTS.cpo_enterprise_markup_percent}
                    onChange={e => setSettingsForm(prev => ({ ...prev, cpo_enterprise_markup_percent: e.target.value }))}
                    placeholder="15"
                  />
                  <p className="text-xs text-muted-foreground">Markup for enterprise CPO price.</p>
                </div>
              </div>
              <Button className="mt-4" size="sm" onClick={handleSaveSettings} disabled={settingsSaving}>
                {settingsSaving ? 'Saving...' : 'Save CPO Settings'}
              </Button>
            </CardContent>
          </Card>

          {/* Depreciation Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowDownRight className="h-4 w-4" />
                Depreciation Preview
              </CardTitle>
              <CardDescription>
                Enter a CPO price and adjust the annual depreciation rate to preview the {settingsForm.cpo_buyback_years || '3'}-year schedule.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="space-y-2 w-48">
                  <Label>CPO Price ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={depreciationInput}
                    onChange={e => setDepreciationInput(e.target.value)}
                    placeholder="e.g. 800"
                  />
                </div>
                <div className="space-y-2 w-44">
                  <Label>Device Brand</Label>
                  <Select
                    value={previewDepreciationBrand}
                    onValueChange={(value) => {
                      const nextBrand = value as DepreciationPreviewBrand
                      setPreviewDepreciationBrand(nextBrand)
                      setPreviewDepreciationRate('')
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apple">Apple</SelectItem>
                      <SelectItem value="samsung">Samsung</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="oneplus">OnePlus</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 w-44">
                  <Label className="flex items-center gap-1">
                    Annual Depreciation Rate (%)
                    <span className="text-xs text-muted-foreground font-normal">(preview only)</span>
                  </Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={effectivePreviewDepreciationRate}
                      onChange={e => setPreviewDepreciationRate(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    {previewDepreciationRate !== '' && previewDepreciationRate !== brandDefaultDepreciationRate && (
                      <button
                        type="button"
                        onClick={() => setPreviewDepreciationRate('')}
                        className="text-xs text-muted-foreground underline hover:text-foreground ml-1"
                        title="Reset to brand default"
                      >
                        reset
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Default ({DEPRECIATION_BRAND_LABEL[previewDepreciationBrand]}): {brandDefaultDepreciationRate}%/yr · Global saved: {globalSavedDepreciationRate}%/yr · Period: {settingsForm.cpo_buyback_years || '3'} yrs
                  </p>
                </div>
              </div>

              {depreciationSchedule.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Annual Depreciation</TableHead>
                        <TableHead className="text-right">Residual Value</TableHead>
                        <TableHead className="text-right">% of Original</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">0 (Purchase)</TableCell>
                        <TableCell className="text-right font-mono">-</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{formatCurrency(parseFloat(depreciationInput))}</TableCell>
                        <TableCell className="text-right font-mono">100%</TableCell>
                      </TableRow>
                      {depreciationSchedule.map((row) => (
                        <TableRow key={row.year}>
                          <TableCell className="font-medium">Year {row.year}</TableCell>
                          <TableCell className="text-right font-mono text-red-600">-{formatCurrency(row.depreciation)}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{formatCurrency(row.value)}</TableCell>
                          <TableCell className="text-right font-mono">{Math.round((row.value / parseFloat(depreciationInput)) * 100)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <strong>Buyback guarantee value after {settingsForm.cpo_buyback_years || '3'} years:</strong>{' '}
                    <span className="font-mono font-semibold text-foreground">
                      {formatCurrency(depreciationSchedule[depreciationSchedule.length - 1]?.value ?? 0)}
                    </span>{' '}
                    ({Math.round(((depreciationSchedule[depreciationSchedule.length - 1]?.value ?? 0) / parseFloat(depreciationInput)) * 100)}% of original {formatCurrency(parseFloat(depreciationInput))})
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 3: INTERNATIONAL PRICING */}
        {/* ============================================================ */}
        <TabsContent value="international" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-500" />
                    International Pricing Upload
                  </CardTitle>
                  <CardDescription>
                    Upload regional pricing data from CSV files for international markets (EU, APAC, LATAM, MEA).
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Upload instructions */}
              <div className="rounded-lg border-2 border-dashed p-6 text-center space-y-4">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Upload International Pricing CSV</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Required columns: device_make, device_model, storage, condition, region, country_code
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Optional: trade_in_price, cpo_price, wholesale_price, retail_price, currency, exchange_rate
                  </p>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={() => {
                    const headers = ['device_make', 'device_model', 'storage', 'condition', 'trade_in_price', 'cpo_price', 'region', 'country_code', 'currency', 'exchange_rate']
                    const sample = [
                      ['Apple', 'iPhone 14', '128GB', 'excellent', '450', '650', 'EU', 'DE', 'EUR', '1.47'],
                      ['Apple', 'iPhone 13', '256GB', 'good', '350', '520', 'APAC', 'JP', 'JPY', '0.0089'],
                    ]
                    const csv = [headers.join(','), ...sample.map(r => r.join(','))].join('\n')
                    const blob = new Blob([csv], { type: 'text/csv' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = 'international-pricing-template.csv'
                    a.click()
                    toast.success('Template downloaded')
                  }}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Download Template
                  </Button>
                  <Button onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = '.csv'
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0]
                      if (!file) return
                      const text = await file.text()
                      const lines = text.trim().split('\n')
                      if (lines.length < 2) {
                        toast.error('CSV file appears empty')
                        return
                      }
                      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
                      const rows = lines.slice(1).map(line => {
                        const values = line.split(',')
                        const row: Record<string, string> = {}
                        headers.forEach((h, i) => { row[h] = values[i]?.trim() || '' })
                        return row
                      })
                      try {
                        const res = await fetch('/api/pricing/international', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ rows, filename: file.name }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error)
                        toast.success(`Uploaded ${data.processed} prices${data.errors ? `, ${data.errors} errors` : ''}`)
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Upload failed')
                      }
                    }
                    input.click()
                  }}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload CSV
                  </Button>
                </div>
              </div>

              {/* Region reference */}
              <div className="grid gap-4 md:grid-cols-5">
                {[
                  { code: 'NA', label: 'North America', countries: 'US, CA, MX' },
                  { code: 'EU', label: 'Europe', countries: 'UK, DE, FR, ES, IT' },
                  { code: 'APAC', label: 'Asia Pacific', countries: 'JP, CN, AU, SG, KR' },
                  { code: 'LATAM', label: 'Latin America', countries: 'BR, AR, CL, CO' },
                  { code: 'MEA', label: 'Middle East & Africa', countries: 'AE, SA, ZA, NG' },
                ].map(region => (
                  <div key={region.code} className="rounded-lg border p-3">
                    <p className="text-sm font-semibold">{region.code}</p>
                    <p className="text-xs text-muted-foreground">{region.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{region.countries}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB 4: TRAINING DATA */}
        {/* ============================================================ */}
        <TabsContent value="training" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4 text-purple-500" />
                    Training Data Management
                  </CardTitle>
                  <CardDescription>
                    Generate and manage training data for the ML pricing model. More data = better price predictions.
                  </CardDescription>
                </div>
                <Button
                  onClick={async () => {
                    toast.info('Generating 1000 training samples...')
                    try {
                      const res = await fetch('/api/pricing/training', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ count: 1000, source: 'simulation' }),
                      })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error)
                      toast.success(`Generated ${data.inserted} training samples`)
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Generation failed')
                    }
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Generate 1000 Samples
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <p className="text-2xl font-bold text-blue-600">—</p>
                  <p className="text-xs text-muted-foreground">Total Training Records</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-2xl font-bold text-green-600">—</p>
                  <p className="text-xs text-muted-foreground">Validated Records</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-2xl font-bold text-amber-600">—</p>
                  <p className="text-xs text-muted-foreground">Pending Validation</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-2xl font-bold text-purple-600">—</p>
                  <p className="text-xs text-muted-foreground">From Completed Orders</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="outline" onClick={async () => {
                  toast.info('Generating 5000 training samples...')
                  try {
                    const res = await fetch('/api/pricing/training', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ count: 5000, source: 'simulation' }),
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error)
                    toast.success(`Generated ${data.inserted} training samples`)
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Generation failed')
                  }
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Generate 5000 Samples
                </Button>
                <Button variant="destructive" onClick={async () => {
                  if (!confirm('Delete ALL simulation training data?')) return
                  try {
                    const res = await fetch('/api/pricing/training?source=simulation', { method: 'DELETE' })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error)
                    toast.success(data.message || 'Simulation data deleted')
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Delete failed')
                  }
                }}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Simulation Data
                </Button>
                <Button
                  variant={trainingInProgress ? 'secondary' : 'default'}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  disabled={trainingInProgress}
                  onClick={async () => {
                    setTrainingInProgress(true)
                    setTrainingResult(null)
                    const toastId = toast.info('Training model with all data sources... This may take a minute.', { duration: 60000 })
                    const startTime = Date.now()
                    try {
                      const res = await fetch('/api/pricing/train', { method: 'POST' })
                      const d = await res.json()
                      const duration_ms = Date.now() - startTime
                      toast.dismiss(toastId)
                      if (res.ok) {
                        setTrainingResult({ ...d, success: true, duration_ms })
                        const totalSamples = Object.values(d.sample_counts || {}).reduce((a: number, b: unknown) => a + (typeof b === 'number' ? b : 0), 0)
                        toast.success(`Model trained! ${d.baselines_upserted} baselines from ${totalSamples} samples in ${(duration_ms/1000).toFixed(1)}s`)
                      } else {
                        setTrainingResult({ success: false, baselines_upserted: 0, condition_multipliers_updated: false, sample_counts: { order_items: 0, imei_records: 0, sales_history: 0, market_prices: 0, competitor_prices: 0, training_data: 0 }, errors: [d.error || 'Training failed'], timestamp: new Date().toISOString(), duration_ms })
                        toast.error(d.error || 'Training failed')
                      }
                    } catch {
                      toast.dismiss(toastId)
                      setTrainingResult({ success: false, baselines_upserted: 0, condition_multipliers_updated: false, sample_counts: { order_items: 0, imei_records: 0, sales_history: 0, market_prices: 0, competitor_prices: 0, training_data: 0 }, errors: ['Network error'], timestamp: new Date().toISOString(), duration_ms: Date.now() - startTime })
                      toast.error('Training failed — network error')
                    } finally {
                      setTrainingInProgress(false)
                    }
                  }}
                >
                  {trainingInProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                  {trainingInProgress ? 'Training Model...' : 'Train Model Now'}
                </Button>
              </div>

              {/* Info */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="text-sm font-semibold mb-2">Training Data Sources</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• <strong>Order completion</strong>: Automatically captured when orders are marked complete</li>
                  <li>• <strong>Simulation</strong>: Generated samples based on existing competitor prices and device catalog</li>
                  <li>• <strong>Manual import</strong>: Upload historical pricing data from spreadsheets</li>
                </ul>
              </div>

              {/* Training Results */}
              {trainingResult && (
                <div className={`rounded-lg border p-4 ${trainingResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    {trainingResult.success ? (
                      <><Zap className="h-4 w-4 text-green-600" /> Training Complete</>
                    ) : (
                      <><Activity className="h-4 w-4 text-red-600" /> Training Failed</>
                    )}
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Baselines Created</p>
                      <p className="font-semibold text-lg">{trainingResult.baselines_upserted}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Duration</p>
                      <p className="font-semibold text-lg">{(trainingResult.duration_ms / 1000).toFixed(1)}s</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Condition Multipliers</p>
                      <p className="font-semibold text-lg">{trainingResult.condition_multipliers_updated ? 'Updated' : 'Unchanged'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Timestamp</p>
                      <p className="font-semibold text-sm">{new Date(trainingResult.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Samples by Source:</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(trainingResult.sample_counts).map(([source, count]) => (
                        <Badge key={source} variant={count > 0 ? 'default' : 'outline'} className="text-xs">
                          {source.replace(/_/g, ' ')}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {trainingResult.errors.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-red-600 font-medium mb-1">Errors:</p>
                      <ul className="text-xs text-red-600 space-y-0.5">
                        {trainingResult.errors.slice(0, 5).map((err, i) => <li key={i}>• {err}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        {/* ============================================================ */}
        {/* TAB 5: PRICING SETTINGS */}
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
                        setTrainingResult({ success: false, baselines_upserted: 0, condition_multipliers_updated: false, sample_counts: { order_items: 0, imei_records: 0, sales_history: 0, market_prices: 0, competitor_prices: 0, training_data: 0 }, errors: [d.error || 'Training failed'], timestamp: new Date().toISOString(), duration_ms })
                        toast.error(d.error || 'Training failed')
                      }
                    } catch {
                      setTrainingResult({ success: false, baselines_upserted: 0, condition_multipliers_updated: false, sample_counts: { order_items: 0, imei_records: 0, sales_history: 0, market_prices: 0, competitor_prices: 0, training_data: 0 }, errors: ['Network error'], timestamp: new Date().toISOString(), duration_ms: Date.now() - startTime })
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
              <CardDescription>Controls for margin targets, competitiveness, and routing. Saved settings apply to the entire system: orders, quotes, pricing API, and calculator — not just this page.</CardDescription>
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

                  {/* CPO & Buyback Settings */}
                  <div className="rounded-lg border p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium">CPO &amp; Buyback</p>
                      <p className="text-xs text-muted-foreground">Configure depreciation schedule for buyback guarantee projections.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="setting-cpo_depreciation_rate" className="text-sm">Annual Depreciation Rate (%)</Label>
                        <Input
                          id="setting-cpo_depreciation_rate"
                          type="number"
                          step="0.5"
                          min="0"
                          max="50"
                          value={settingsForm.cpo_depreciation_rate ?? SETTINGS_DEFAULTS.cpo_depreciation_rate}
                          onChange={e => setSettingsForm(prev => ({ ...prev, cpo_depreciation_rate: e.target.value }))}
                          placeholder="15"
                        />
                        <p className="text-xs text-muted-foreground">Device value decreases by this % each year for buyback guarantee.</p>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="setting-cpo_buyback_years" className="text-sm">Buyback Guarantee Period (years)</Label>
                        <Input
                          id="setting-cpo_buyback_years"
                          type="number"
                          step="1"
                          min="1"
                          max="10"
                          value={settingsForm.cpo_buyback_years ?? SETTINGS_DEFAULTS.cpo_buyback_years}
                          onChange={e => setSettingsForm(prev => ({ ...prev, cpo_buyback_years: e.target.value }))}
                          placeholder="3"
                        />
                        <p className="text-xs text-muted-foreground">Number of years shown in depreciation schedule.</p>
                      </div>
                    </div>
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

          {/* International Pricing Upload Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">International Pricing Upload</CardTitle>
              <CardDescription>
                Bulk import competitor prices from international markets via CSV. Prices are stored as &quot;International&quot; competitor entries.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={handleIntlDownloadTemplate}>
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                  Download Template
                </Button>
                <p className="text-xs text-muted-foreground">
                  Columns: device_name, storage, trade_in_price, sell_price (at least one price required)
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Input
                  type="file"
                  accept=".csv"
                  className="max-w-xs"
                  onChange={e => {
                    setIntlFile(e.target.files?.[0] || null)
                    setIntlResult(null)
                  }}
                />
                <Button
                  onClick={handleIntlUpload}
                  disabled={!intlFile || intlUploading}
                  size="sm"
                >
                  {intlUploading ? 'Uploading...' : 'Upload'}
                </Button>
              </div>

              {intlResult && (
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center gap-4 text-sm">
                    <Badge variant="default">{intlResult.imported} imported</Badge>
                    {intlResult.skipped > 0 && (
                      <Badge variant="secondary">{intlResult.skipped} skipped</Badge>
                    )}
                  </div>
                  {intlResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-destructive mb-1">Issues:</p>
                      <ul className="text-xs text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
                        {intlResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
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
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Competitor Price</DialogTitle>
            <DialogDescription>Track a competitor&apos;s trade-in or resale offer</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  {COMPETITOR_LIST.map(c => <SelectItem key={c} value={c}>{COMPETITOR_DISPLAY_NAMES[c] || c}</SelectItem>)}
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
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Benchmark Preview</DialogTitle>
            <DialogDescription>
              Review the proposed prices before applying. Based on competitor averages ({benchmark.condition === 'all' ? 'all conditions' : benchmark.condition}),{' '}
              {benchmark.direction === 'increase' ? '+' : '−'}
              {benchmark.adjustment_type === 'fixed' ? `$${benchmark.value}` : `${benchmark.value}%`} per device.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
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
                  <TableCell className="font-medium whitespace-nowrap">{item.device_label}</TableCell>
                  <TableCell>{item.storage}</TableCell>
                  <TableCell className="capitalize">{item.condition}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground whitespace-nowrap">{formatCurrency(item.current_price)}</TableCell>
                  <TableCell className="text-right font-mono font-medium whitespace-nowrap">{formatCurrency(item.proposed_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
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
