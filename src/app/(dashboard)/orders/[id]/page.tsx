// ============================================================================
// ORDER DETAIL PAGE
// ============================================================================

'use client'

import { useState, Fragment, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, CheckCircle2, AlertTriangle, ChevronRight, ChevronDown, ChevronUp, DollarSign, Send, FileDown, Sparkles, Loader2, GitBranch, ExternalLink, Truck, Package, Shield, RotateCcw, Pencil, Check, Plus, TrendingDown, UserPlus, ThumbsUp, ThumbsDown } from 'lucide-react'
import { toast } from 'sonner'
import { useOrder } from '@/hooks/useOrders'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/useAuth'
import { useOrderShipments } from '@/hooks/useShipments'
import { getDefaultAppPathForRole } from '@/lib/auth-routing'
import { formatCurrency, formatDateTime, snakeToTitle } from '@/lib/utils'
import { ORDER_STATUS_CONFIG, CUSTOMER_STATUS_CONFIG, VALID_ORDER_TRANSITIONS, CONDITION_CONFIG, STORAGE_OPTIONS } from '@/lib/constants'
import type { OrderStatus, OrderItem, PricingMetadata, AuditLog, VendorBid, Vendor, TriageResult } from '@/types'
import type { Order } from '@/types'

const COE_ADDRESS = {
  name: 'COE Warehouse',
  street1: '123 COE Dr',
  city: 'Austin',
  state: 'TX',
  postal_code: '73301',
  country: 'US',
}

const SHIPMENT_CARRIERS = ['FedEx', 'UPS', 'USPS', 'DHL', 'Canada Post', 'Other']

function buildShipToAddress(order: Order): Record<string, unknown> {
  if (order.type === 'trade_in' && order.customer) {
    const customer = order.customer as unknown as Record<string, unknown>
    const shipping = (customer.shipping_address as Record<string, unknown>) || (customer.billing_address as Record<string, unknown>) || {}
    return {
      name: (customer.contact_name || customer.company_name) as string || 'Customer',
      company: customer.company_name as string | undefined,
      street1: (shipping.street1 || shipping.line1 || shipping.address1) as string || 'Unknown',
      street2: (shipping.street2 || shipping.line2 || shipping.address2) as string | undefined,
      city: (shipping.city as string) || 'Unknown',
      state: (shipping.state as string) || 'Unknown',
      postal_code: (shipping.postal_code || shipping.zip_code || shipping.zip) as string || '00000',
      country: (shipping.country as string) || 'US',
      phone: customer.contact_phone as string | undefined,
      email: customer.contact_email as string | undefined,
    }
  }
  if (order.type === 'cpo' && order.vendor) {
    const vendor = order.vendor as unknown as Record<string, unknown>
    const addr = (vendor.address as Record<string, unknown>) || {}
    return {
      name: (vendor.contact_name || vendor.company_name) as string || 'Vendor',
      company: vendor.company_name as string | undefined,
      street1: (addr.street1 || addr.line1 || addr.address1) as string || 'Unknown',
      street2: (addr.street2 || addr.line2 || addr.address2) as string | undefined,
      city: (addr.city as string) || 'Unknown',
      state: (addr.state as string) || 'Unknown',
      postal_code: (addr.postal_code || addr.zip_code || addr.zip) as string || '00000',
      country: (addr.country as string) || 'US',
      phone: vendor.contact_phone as string | undefined,
      email: vendor.contact_email as string | undefined,
    }
  }
  return { name: 'Unknown', street1: 'Unknown', city: 'Unknown', state: 'Unknown', postal_code: '00000', country: 'US' }
}

function mapOrderConditionToCompetitorCondition(condition?: string): 'excellent' | 'good' | 'fair' | 'broken' {
  if (condition === 'new' || condition === 'excellent') return 'excellent'
  if (condition === 'fair') return 'fair'
  if (condition === 'poor' || condition === 'broken') return 'broken'
  return 'good'
}

function competitorConditionOrder(condition: string): number {
  if (condition === 'excellent') return 0
  if (condition === 'good') return 1
  if (condition === 'fair') return 2
  if (condition === 'broken') return 3
  return 4
}

const SHIPMENT_STATUSES = ['accepted', 'sourcing', 'sourced', 'shipped_to_coe', 'received', 'ready_to_ship', 'shipped', 'delivered'] as const

function getCarrierTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const c = carrier.toLowerCase()
  const tn = encodeURIComponent(trackingNumber.trim())
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${tn}`
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${tn}`
  if (c.includes('usps') || c.includes('united states postal')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`
  if (c.includes('dhl')) return `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`
  if (c.includes('canada post') || c.includes('canadapost')) return `https://www.canadapost-postescanada.ca/track-reperage/en#/detail/${tn}`
  if (c.includes('ontrac') || c.includes('on trac')) return `https://www.ontrac.com/tracking?tracking_number=${tn}`
  return null
}

function getVendorTransitionLabel(status: OrderStatus): string {
  switch (status) {
    case 'sourcing':
      return 'Accept Job'
    case 'sourced':
      return 'Mark Sourced'
    case 'shipped':
      return 'Mark Shipped'
    case 'delivered':
      return 'Mark Delivered'
    case 'closed':
      return 'Complete Fulfillment'
    default:
      return ORDER_STATUS_CONFIG[status]?.label || snakeToTitle(status)
  }
}

export default function OrderDetailPage() {
  const params = useParams()
  const { user } = useAuth()
  const isCustomer = user?.role === 'customer'
  const isVendor = user?.role === 'vendor'
  const canSetPricingByRole = user?.role === 'admin' || user?.role === 'coe_manager'
  const { order, isLoading, transition, isTransitioning, refetch } = useOrder(params.id as string)
  const isCpoOrder = order?.type === 'cpo'
  const canSetPricing = isCpoOrder ? user?.role === 'admin' : canSetPricingByRole
  const canSendQuote = !isCustomer && !isVendor && ['admin', 'coe_manager', 'sales'].includes(user?.role ?? '')
  const { shipments: orderShipments, refetch: refetchShipments } = useOrderShipments(params.id as string)
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false)
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({})
  const [itemMetadata, setItemMetadata] = useState<Record<string, PricingMetadata>>({})
  const [expandedPricingContext, setExpandedPricingContext] = useState<string | null>(null)
  const [isSavingPrices, setIsSavingPrices] = useState(false)
  const [isRepricingMismatches, setIsRepricingMismatches] = useState(false)
  const [isSendingMismatchNotice, setIsSendingMismatchNotice] = useState(false)
  const [isSendingQuote, setIsSendingQuote] = useState(false)
  const [isNotifyingPriceChange, setIsNotifyingPriceChange] = useState(false)
  const [suggestingItemId, setSuggestingItemId] = useState<string | null>(null)
  const [transitionTarget, setTransitionTarget] = useState<OrderStatus | null>(null)
  const [transitionNotes, setTransitionNotes] = useState('')
  const [beatCompetitorPercent, setBeatCompetitorPercent] = useState<number>(0)
  const [mismatchAuditLogs, setMismatchAuditLogs] = useState<AuditLog[]>([])
  const [mismatchAuditLoading, setMismatchAuditLoading] = useState(false)
  const [addMismatchDialogOpen, setAddMismatchDialogOpen] = useState(false)
  const [addMismatchSelections, setAddMismatchSelections] = useState<Record<string, string>>({})
  const [isAddingMismatch, setIsAddingMismatch] = useState(false)
  const [highlightedPricingItemIds, setHighlightedPricingItemIds] = useState<string[]>([])
  const [isCalculatingBuyback, setIsCalculatingBuyback] = useState(false)
  const [depreciationSchedule, setDepreciationSchedule] = useState<{
    rate: number
    years: number
    items: Array<{
      id: string
      device_id: string
      guaranteed_buyback_price: number
      is_estimated?: boolean
      price_source?: string
      schedule: Array<{ year: number; value: number; depreciation_pct: number }>
    }>
  } | null>(null)
  const [editableDepreciationRate, setEditableDepreciationRate] = useState('')
  const [isSavingDepreciation, setIsSavingDepreciation] = useState(false)
  // Market context: competitor prices for each device in pricing dialog
  const [marketContext, setMarketContext] = useState<Record<string, {
    loading: boolean
    conditions: { condition: string; avg_trade: number; avg_cpo: number; competitors: { name: string; trade: number | null; sell: number | null }[] }[]
  }>>({})
  // Price suggests for Line Items table (per item)
  const [lineItemSuggestions, setLineItemSuggestions] = useState<Record<string, number>>({})
  const [lineItemSuggestionsLoading, setLineItemSuggestionsLoading] = useState(false)
  // Inline edit mode for Line Items
  const [isInlineEditing, setIsInlineEditing] = useState(false)
  const [inlineEditPrices, setInlineEditPrices] = useState<Record<string, string>>({})
  // Create Shipment dialog
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false)
  const [isCreatingShipment, setIsCreatingShipment] = useState(false)
  const [shipmentDirection, setShipmentDirection] = useState<'inbound' | 'outbound'>('inbound')
  const [shipmentCarrier, setShipmentCarrier] = useState('FedEx')
  const [shipmentCustomCarrier, setShipmentCustomCarrier] = useState('')
  const [shipmentTrackingNumber, setShipmentTrackingNumber] = useState('')
  const [shipmentNotes, setShipmentNotes] = useState('')
  const [shipmentStallionPurchase, setShipmentStallionPurchase] = useState(false)
  const [shipmentWeight, setShipmentWeight] = useState('2')
  const [shipmentDimensions, setShipmentDimensions] = useState({ length: '12', width: '8', height: '4' })

  // Customer ship-to-us form
  const [customerShipCarrier, setCustomerShipCarrier] = useState('FedEx')
  const [customerShipTracking, setCustomerShipTracking] = useState('')
  const [customerShipNotes, setCustomerShipNotes] = useState('')
  const [isCustomerShipping, setIsCustomerShipping] = useState(false)

  // Assign Vendor dialog state
  const [assignVendorDialogOpen, setAssignVendorDialogOpen] = useState(false)
  const [vendorsList, setVendorsList] = useState<Vendor[]>([])
  const [vendorsLoading, setVendorsLoading] = useState(false)
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [isAssigningVendor, setIsAssigningVendor] = useState(false)

  // Vendor Bids state
  const [vendorBids, setVendorBids] = useState<VendorBid[]>([])
  const [vendorBidsLoading, setVendorBidsLoading] = useState(false)
  const [acceptBidDialogOpen, setAcceptBidDialogOpen] = useState(false)
  const [rejectBidDialogOpen, setRejectBidDialogOpen] = useState(false)
  const [selectedBid, setSelectedBid] = useState<VendorBid | null>(null)
  const [bidMarkupPercent, setBidMarkupPercent] = useState('15')
  const [isBidActionLoading, setIsBidActionLoading] = useState(false)

  // Customer exception approval
  const [pendingExceptions, setPendingExceptions] = useState<TriageResult[]>([])
  const [exceptionsLoading, setExceptionsLoading] = useState(false)
  const [exceptionProcessingId, setExceptionProcessingId] = useState<string | null>(null)

  const fetchMarketContext = async (items: OrderItem[]) => {
    const uniqueDevices = new Map<string, { device_id: string; storage: string }>()
    items.forEach(item => {
      if (item.device_id) {
        const key = `${item.device_id}_${getStorageForItem(item)}`
        uniqueDevices.set(key, { device_id: item.device_id, storage: getStorageForItem(item) })
      }
    })

    const newCtx: typeof marketContext = {}
    uniqueDevices.forEach((_, key) => {
      newCtx[key] = { loading: true, conditions: [] }
    })
    setMarketContext(newCtx)

    for (const [key, { device_id, storage }] of Array.from(uniqueDevices.entries())) {
      try {
        const res = await fetch(`/api/pricing/competitors?device_id=${device_id}`)
        if (res.ok) {
          const data = await res.json()
          const allRows = data.data || data || []
          // Filter by storage
          const rows = allRows.filter((r: Record<string, unknown>) => !r.storage || r.storage === storage)
          // Group by condition
          const byCondition = new Map<string, { name: string; trade: number | null; sell: number | null }[]>()
          for (const row of rows) {
            const cond = mapOrderConditionToCompetitorCondition(String(row.condition || 'good'))
            if (!byCondition.has(cond)) byCondition.set(cond, [])
            byCondition.get(cond)!.push({
              name: String(row.competitor_name || row.source || 'Unknown'),
              trade: row.trade_in_price ?? null,
              sell: row.sell_price ?? null,
            })
          }
          const conditions = Array.from(byCondition.entries()).map(([condition, competitors]) => {
            const trades = competitors.filter(c => c.trade != null).map(c => c.trade!)
            const sells = competitors.filter(c => c.sell != null).map(c => c.sell!)
            return {
              condition,
              avg_trade: trades.length ? trades.reduce((a, b) => a + b, 0) / trades.length : 0,
              avg_cpo: sells.length ? sells.reduce((a, b) => a + b, 0) / sells.length : 0,
              competitors,
            }
          }).sort((left, right) => competitorConditionOrder(left.condition) - competitorConditionOrder(right.condition))
          setMarketContext(prev => ({ ...prev, [key]: { loading: false, conditions } }))
        } else {
          setMarketContext(prev => ({ ...prev, [key]: { loading: false, conditions: [] } }))
        }
      } catch {
        setMarketContext(prev => ({ ...prev, [key]: { loading: false, conditions: [] } }))
      }
    }
  }

  const handleTransition = async (newStatus: OrderStatus) => {
    try {
      await transition({ status: newStatus, notes: transitionNotes || undefined })
      toast.success(`Order moved to ${ORDER_STATUS_CONFIG[newStatus]?.label}`)
      setTransitionTarget(null)
      setTransitionNotes('')
    } catch {
      toast.error('Failed to update order status')
    }
  }

  const fetchMismatchAuditLogs = useCallback(async () => {
    if (!order?.id || !canSetPricing) return
    setMismatchAuditLoading(true)
    try {
      const response = await fetch(`/api/orders/${order.id}/audit-mismatch`)
      if (!response.ok) {
        setMismatchAuditLogs([])
        return
      }
      const payload = await response.json()
      setMismatchAuditLogs((payload.data || []) as AuditLog[])
    } catch {
      setMismatchAuditLogs([])
    } finally {
      setMismatchAuditLoading(false)
    }
  }, [order?.id, canSetPricing])

  useEffect(() => {
    fetchMismatchAuditLogs()
  }, [fetchMismatchAuditLogs])

  const handleAddMismatch = async () => {
    if (!order?.id || !order.items?.length) return
    const itemsToSend = order.items
      .filter((item) => {
        const actual = addMismatchSelections[item.id]
        if (!actual) return false
        const claimed = item.claimed_condition || 'good'
        return actual !== claimed
      })
      .map((item) => ({
        order_item_id: item.id,
        actual_condition: addMismatchSelections[item.id],
      }))
    if (itemsToSend.length === 0) {
      toast.error('Select at least one device with actual condition different from claimed')
      return
    }
    setIsAddingMismatch(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/add-mismatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSend }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add mismatch')
      }
      toast.success(`Added ${data.added_count ?? itemsToSend.length} mismatched device(s). Linked to triage/exceptions.`)
      setAddMismatchDialogOpen(false)
      setAddMismatchSelections({})
      fetchMismatchAuditLogs()
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add mismatch')
    } finally {
      setIsAddingMismatch(false)
    }
  }

  const getStorageForItem = (item: OrderItem): string => {
    if (item.storage && STORAGE_OPTIONS.includes(item.storage)) return item.storage
    const variant = item.device?.variant || ''
    const match = STORAGE_OPTIONS.find(s => variant.includes(s))
    return match || '128GB'
  }

  const fetchLineItemSuggestions = useCallback(async () => {
    if (!order?.items?.length || isCpoOrder || !canSetPricing) return
    setLineItemSuggestionsLoading(true)
    try {
      const items = order.items.map((item: OrderItem) => ({
        device_id: item.device_id,
        storage: getStorageForItem(item),
        condition: item.claimed_condition || 'good',
      }))
      const res = await fetch('/api/pricing/calculate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, price_mode: 'trade_in' }),
      })
      if (!res.ok) return
      const { data } = await res.json()
      const suggestions: Record<string, number> = {}
      for (let i = 0; i < (data || []).length; i++) {
        const rec = data[i]
        const item = order.items[i]
        if (item && rec?.trade_price != null && rec.trade_price > 0) {
          suggestions[item.id] = rec.trade_price
        }
      }
      setLineItemSuggestions(suggestions)
    } catch {
      // ignore
    } finally {
      setLineItemSuggestionsLoading(false)
    }
  }, [order?.items, isCpoOrder, canSetPricing])

  useEffect(() => {
    fetchLineItemSuggestions()
  }, [fetchLineItemSuggestions])

  // Sync editable depreciation rate when schedule or order loads
  useEffect(() => {
    if (depreciationSchedule) {
      setEditableDepreciationRate(prev => prev === '' ? String(depreciationSchedule.rate) : prev)
    } else if (order?.depreciation_rate_override != null) {
      setEditableDepreciationRate(String(order.depreciation_rate_override))
    }
  }, [depreciationSchedule, order?.depreciation_rate_override])

  // Reconstruct depreciation schedule when items have buyback but no schedule (e.g. page refresh)
  useEffect(() => {
    if (!isCpoOrder || !order?.items || depreciationSchedule) return
    const buybackItems = order.items.filter((i: OrderItem) => (i.guaranteed_buyback_price ?? 0) > 0)
    if (buybackItems.length === 0) return
    const rate = order.depreciation_rate_override ?? 15
    const years = 3
    const buildSchedule = (price: number) => Array.from({ length: years + 1 }, (_, yr) => {
      const factor = Math.pow(1 - rate / 100, yr)
      return {
        year: yr,
        value: Math.round(price * factor * 100) / 100,
        depreciation_pct: yr === 0 ? 0 : Math.round((1 - factor) * 10000) / 100,
      }
    })
    setDepreciationSchedule({
      rate,
      years,
      items: buybackItems.map((i: OrderItem) => ({
        id: i.id,
        device_id: i.device_id,
        guaranteed_buyback_price: i.guaranteed_buyback_price!,
        schedule: buildSchedule(i.guaranteed_buyback_price!),
      })),
    })
    setEditableDepreciationRate(String(rate))
  }, [isCpoOrder, order?.items, order?.depreciation_rate_override, depreciationSchedule])

  // Display schedule: recompute when user edits depreciation rate
  const displaySchedule = useMemo(() => {
    if (!depreciationSchedule) return null
    const editedRate = parseFloat(editableDepreciationRate)
    const effectiveRate = Number.isFinite(editedRate) && editedRate >= 0 && editedRate <= 50 ? editedRate : depreciationSchedule.rate
    if (Math.abs(effectiveRate - depreciationSchedule.rate) < 0.01) return depreciationSchedule
    const buildSchedule = (price: number) => Array.from({ length: depreciationSchedule.years + 1 }, (_, yr) => {
      const factor = Math.pow(1 - effectiveRate / 100, yr)
      return {
        year: yr,
        value: Math.round(price * factor * 100) / 100,
        depreciation_pct: yr === 0 ? 0 : Math.round((1 - factor) * 10000) / 100,
      }
    })
    return {
      ...depreciationSchedule,
      rate: effectiveRate,
      items: depreciationSchedule.items.map(it => ({
        ...it,
        schedule: buildSchedule(it.guaranteed_buyback_price),
      })),
    }
  }, [depreciationSchedule, editableDepreciationRate])

  const handleOpenPricingDialog = (priceOverrides?: Record<string, string>) => {
    const prices: Record<string, string> = {}
    const metadata: Record<string, PricingMetadata> = {}
    order?.items?.forEach(item => {
      prices[item.id] = priceOverrides?.[item.id] ?? item.unit_price?.toString() ?? ''
      if (item.pricing_metadata) {
        // Strip suggested_by_calc from existing metadata for CPO orders — the API blocks it
        const meta = item.pricing_metadata as Record<string, unknown>
        if (isCpoOrder && meta.suggested_by_calc) {
          const { suggested_by_calc: _removed, ...rest } = meta
          metadata[item.id] = rest as PricingMetadata
        } else {
          metadata[item.id] = item.pricing_metadata
        }
      }
    })
    setItemPrices(prices)
    setItemMetadata(metadata)
    setPricingDialogOpen(true)
    // Load saved beat_competitor_percent setting
    fetch('/api/pricing/settings')
      .then(r => r.ok ? r.json() : {})
      .then((payload: { data?: Record<string, unknown> }) => {
        const saved = Number(payload.data?.beat_competitor_percent)
        if (!isNaN(saved) && saved >= 0) setBeatCompetitorPercent(saved)
      })
      .catch(() => {})
    if (order?.items) fetchMarketContext(order.items)
  }

  const handleOpenPricingFromAudit = (log: AuditLog) => {
    const newValues = (log.new_values || {}) as { repriced_items?: Array<{ order_item_id?: string }>; items?: Array<{ order_item_id?: string }> }
    const oldValues = (log.old_values || {}) as { mismatched_items?: Array<{ order_item_id?: string }>; items?: Array<{ order_item_id?: string }> }
    const metadata = (log.metadata || {}) as { event?: string }

    const affectedItemIds = Array.from(new Set([
      ...(newValues.repriced_items || []).map((item) => item.order_item_id).filter(Boolean),
      ...(oldValues.mismatched_items || []).map((item) => item.order_item_id).filter(Boolean),
      ...(metadata.event === 'admin_added_mismatch' ? [(newValues.items || []).map((item) => item.order_item_id).filter(Boolean), (oldValues.items || []).map((item) => item.order_item_id).filter(Boolean)].flat() : []),
    ])) as string[]

    setHighlightedPricingItemIds(affectedItemIds)
    handleOpenPricingDialog()

    if (affectedItemIds.length > 0) {
      toast.info(`Opened pricing for ${affectedItemIds.length} mismatch item(s)`) 
    }
  }

  const getRiskMode = (): 'retail' | 'enterprise' => {
    return order?.customer?.default_risk_mode || 'retail'
  }

  const handleSuggestPrice = async (item: OrderItem) => {
    if (!item.device_id) {
      toast.error('Device not found for this item')
      return
    }
    setSuggestingItemId(item.id)
    try {
      const res = await fetch('/api/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 'v2',
          device_id: item.device_id,
          storage: getStorageForItem(item),
          carrier: 'Unlocked',
          condition: item.claimed_condition || 'good',
          risk_mode: getRiskMode(),
          quantity: item.quantity,
          beat_competitor_percent: beatCompetitorPercent,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to calculate price')
      }
      const result = await res.json()
      if (result.success && result.trade_price != null) {
        // API returns total (trade_price * quantity); we need per-unit for the input
        const qty = item.quantity || 1
        const unitPrice = result.trade_price / qty
        setItemPrices(prev => ({ ...prev, [item.id]: unitPrice.toFixed(2) }))
        setItemMetadata(prev => ({
          ...prev,
          [item.id]: {
            suggested_by_calc: true,
            confidence: result.confidence,
            margin_tier: result.channel_decision?.margin_tier,
            anchor_price: result.breakdown?.anchor_price,
            channel_decision: result.channel_decision?.recommended_channel,
          },
        }))
        toast.success(`Suggested ${formatCurrency(unitPrice)} (${result.channel_decision?.margin_tier || '—'} margin)`)
      } else {
        toast.error(result.error || 'Could not calculate price')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to suggest price')
    } finally {
      setSuggestingItemId(null)
    }
  }

  const handleSuggestCpoPrice = async (item: OrderItem) => {
    if (!item.device_id) {
      toast.error('Device not found for this item')
      return
    }
    setSuggestingItemId(item.id)
    try {
      const res = await fetch('/api/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 'v2',
          device_id: item.device_id,
          storage: getStorageForItem(item),
          carrier: 'Unlocked',
          condition: item.claimed_condition || 'good',
          risk_mode: getRiskMode(),
          quantity: 1,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to calculate CPO price')
      }
      const result = await res.json()
      const cpoUnit = result.cpo_price ?? result.trade_price
      if (result.success && cpoUnit != null && cpoUnit > 0) {
        setItemPrices(prev => ({ ...prev, [item.id]: cpoUnit.toFixed(2) }))
        // Intentionally NOT setting suggested_by_calc:true — CPO API blocks it
        setItemMetadata(prev => ({
          ...prev,
          [item.id]: {
            ...(prev[item.id] || {}),
            pricing_source: 'manual' as const,
            confidence: result.confidence,
            margin_tier: result.channel_decision?.margin_tier,
            anchor_price: result.breakdown?.anchor_price,
          },
        }))
        toast.success(`CPO suggested price: ${formatCurrency(cpoUnit)}`)
      } else {
        toast.error(result.error || 'Could not calculate CPO price')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to suggest CPO price')
    } finally {
      setSuggestingItemId(null)
    }
  }

  const handleCalculateBuyback = async () => {
    if (!order?.items?.length || !order?.id) return
    setIsCalculatingBuyback(true)
    try {
      const baseDate = order.quoted_at || order.submitted_at || order.created_at
      const res = await fetch('/api/pricing/calculate-buyback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: order.items.map((item: OrderItem) => ({
            id: item.id,
            device_id: item.device_id,
            storage: getStorageForItem(item),
            condition: item.claimed_condition || 'good',
          })),
          valid_months: 24,
          base_date: baseDate,
          depreciation_rate: order.depreciation_rate_override ?? undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to calculate buyback')
      }
      const buybackResult = await res.json()
      const data = buybackResult.data
      // Store depreciation schedule data for the UI
      setDepreciationSchedule({
        rate: buybackResult.depreciation_rate ?? 15,
        years: buybackResult.buyback_years ?? 3,
        items: (data || []).filter((r: { guaranteed_buyback_price: number }) => r.guaranteed_buyback_price > 0).map((r: { id: string; device_id: string; guaranteed_buyback_price: number; is_estimated?: boolean; price_source?: string; depreciation_schedule: Array<{ year: number; value: number; depreciation_pct: number }> }) => ({
          id: r.id,
          device_id: r.device_id,
          guaranteed_buyback_price: r.guaranteed_buyback_price,
          is_estimated: r.is_estimated,
          price_source: r.price_source,
          schedule: r.depreciation_schedule || [],
        })),
      })
      const patchRes = await fetch(`/api/orders/${order.id}/items/buyback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: data.map((r: { id: string; guaranteed_buyback_price: number; buyback_condition: string; buyback_valid_until: string }) => ({
            id: r.id,
            guaranteed_buyback_price: r.guaranteed_buyback_price,
            buyback_condition: r.buyback_condition,
            buyback_valid_until: r.buyback_valid_until,
          })),
        }),
      })
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save buyback')
      }
      setEditableDepreciationRate(String(buybackResult.depreciation_rate ?? 15))
      toast.success('Buyback guarantee calculated and saved')
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to calculate buyback')
    } finally {
      setIsCalculatingBuyback(false)
    }
  }

  const handleSaveDepreciation = async () => {
    if (!order?.id) return
    const rate = parseFloat(editableDepreciationRate)
    if (Number.isNaN(rate) || rate < 0 || rate > 50) {
      toast.error('Depreciation rate must be between 0 and 50%')
      return
    }
    setIsSavingDepreciation(true)
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depreciation_rate_override: rate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save depreciation rate')
      }
      toast.success('Depreciation rate updated')
      setDepreciationSchedule(prev => prev ? { ...prev, rate } : null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save depreciation rate')
    } finally {
      setIsSavingDepreciation(false)
    }
  }

  const handleSavePrices = async () => {
    if (!order?.items) return

    const itemsToSend = order.items.map(item => {
      const raw = itemPrices[item.id] || '0'
      const num = parseFloat(String(raw).replace(/[^0-9.-]/g, ''))
      const unit_price = Number.isFinite(num) ? num : 0
      const payload: { id: string; unit_price: number; pricing_metadata?: PricingMetadata } = {
        id: item.id,
        unit_price,
      }
      if (item.id in itemMetadata) {
        const meta = itemMetadata[item.id] as Record<string, unknown>
        // CPO orders: strip suggested_by_calc — the API will reject it
        if (isCpoOrder && meta?.suggested_by_calc) {
          const { suggested_by_calc: _removed, ...rest } = meta
          payload.pricing_metadata = rest as PricingMetadata
        } else {
          payload.pricing_metadata = itemMetadata[item.id]
        }
      }
      return payload
    })

    setIsSavingPrices(true)
    try {
      const response = await fetch(`/api/orders/${params.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSend })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const msg = data.error || data.details?.[0]?.message || 'Failed to update prices'
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }

      toast.success('Prices updated successfully')
      setPricingDialogOpen(false)
      refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update prices'
      toast.error(message)
    } finally {
      setIsSavingPrices(false)
    }
  }

  const handleRepriceMismatchedItems = async () => {
    if (!order?.items?.length) return

    const mismatchedItems = order.items
      .filter((item) => item.actual_condition && item.claimed_condition && item.actual_condition !== item.claimed_condition)
      .map((item) => ({
        order_item_id: item.id,
        actual_condition: item.actual_condition,
      }))

    if (mismatchedItems.length === 0) {
      toast.info('No condition mismatches found in this order')
      return
    }

    setIsRepricingMismatches(true)
    try {
      const response = await fetch(`/api/orders/${params.id}/items/reprice-mismatches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: mismatchedItems,
          risk_mode: getRiskMode(),
          beat_competitor_percent: beatCompetitorPercent,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to reprice mismatched devices')
      }

      const nextPrices = { ...itemPrices }
      const nextMetadata = { ...itemMetadata }

      for (const rec of payload.recommendations || []) {
        nextPrices[rec.order_item_id] = Number(rec.recommended_unit_price).toFixed(2)
        nextMetadata[rec.order_item_id] = {
          ...(nextMetadata[rec.order_item_id] || {}),
          suggested_by_calc: true,
          confidence: rec.confidence,
          margin_tier: rec.margin_tier,
          channel_decision: rec.channel_decision,
          condition_mismatch: true,
          claimed_condition: rec.claimed_condition,
          actual_condition: rec.actual_condition,
          mismatch_repriced_at: new Date().toISOString(),
        }
      }

      setItemPrices(nextPrices)
      setItemMetadata(nextMetadata)

      toast.success(`Repriced ${payload.recommendation_count || 0} mismatched item(s); notifications sent`) 
      refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reprice mismatched devices')
    } finally {
      setIsRepricingMismatches(false)
    }
  }

  const handleSendMismatchNotice = async () => {
    if (!order?.id) return
    setIsSendingMismatchNotice(true)
    try {
      const response = await fetch(`/api/orders/${order.id}/mismatch-notice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to send mismatch notice')
      }

      toast.success(`Mismatch notice sent (${payload.mismatched_count || 0} devices)`) 
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send mismatch notice')
    } finally {
      setIsSendingMismatchNotice(false)
    }
  }

  const handleSendQuote = async () => {
    setIsSendingQuote(true)
    try {
      if (order?.status === 'draft') {
        await transition({ status: 'submitted' as OrderStatus, notes: 'Auto-submitted for quoting' })
      }
      const result = await refetch()
      const orderToCheck = result?.data ?? order
      const hasPrices = (orderToCheck?.quoted_amount ?? orderToCheck?.total_amount ?? 0) > 0 ||
        (orderToCheck?.items?.reduce((s: number, i: OrderItem) => s + ((i.unit_price ?? 0) * (i.quantity ?? 0)), 0) ?? 0) > 0
      if (!hasPrices) {
        toast.error('Set pricing for all items before sending the quote')
        return
      }
      await transition({ status: 'quoted' as OrderStatus, notes: 'Quote sent to customer' })
      toast.success('Quote sent to customer')
      refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send quote'
      toast.error(msg)
    } finally {
      setIsSendingQuote(false)
    }
  }

  const handleNotifyPriceChange = async () => {
    if (!order) return
    setIsNotifyingPriceChange(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/notify-price-change`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send notification')
      }
      toast.success('Price change email sent to customer')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send price change notification')
    } finally {
      setIsNotifyingPriceChange(false)
    }
  }

  const handleEditAndSendQuote = () => {
    if (!order?.items?.length) return
    const prices: Record<string, string> = {}
    order.items.forEach(item => {
      prices[item.id] = item.unit_price?.toString() ?? ''
    })
    setInlineEditPrices(prices)
    setIsInlineEditing(true)
  }

  const handleSaveAndSendQuote = async () => {
    if (!order?.items?.length) return
    const itemsToSend = order.items.map(item => {
      const raw = isInlineEditing ? (inlineEditPrices[item.id] ?? item.unit_price ?? '') : (item.unit_price ?? '')
      const num = parseFloat(String(raw).replace(/[^0-9.-]/g, ''))
      return { id: item.id, unit_price: Number.isFinite(num) ? num : 0 }
    })
    setIsSavingPrices(true)
    setIsSendingQuote(true)
    try {
      const patchRes = await fetch(`/api/orders/${params.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSend }),
      })
      const patchData = await patchRes.json().catch(() => ({}))
      if (!patchRes.ok) {
        throw new Error(patchData.error || 'Failed to update prices')
      }
      if (order?.status === 'draft') {
        await transition({ status: 'submitted' as OrderStatus, notes: 'Auto-submitted for quoting' })
        await refetch()
      }
      await transition({ status: 'quoted' as OrderStatus, notes: 'Quote sent to customer' })
      toast.success('Prices saved and quote sent to customer')
      setIsInlineEditing(false)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save and send quote')
    } finally {
      setIsSavingPrices(false)
      setIsSendingQuote(false)
    }
  }

  const handleCreateShipment = async () => {
    if (!order) return
    const resolvedCarrier = shipmentCarrier === 'Other' ? shipmentCustomCarrier.trim() : shipmentCarrier.trim()
    if (!resolvedCarrier) {
      toast.error('Carrier or shipping platform is required')
      return
    }
    const useStallion = isVendor ? false : shipmentStallionPurchase
    if (!useStallion && !shipmentTrackingNumber.trim()) {
      toast.error('Tracking number is required for manual shipment entry')
      return
    }
    setIsCreatingShipment(true)
    try {
      const direction = isVendor ? 'inbound' : shipmentDirection
      const payload: Record<string, unknown> = {
        order_id: params.id,
        direction,
        carrier: shipmentCarrier.trim(),
        custom_carrier: shipmentCarrier === 'Other' ? resolvedCarrier : undefined,
        tracking_number: useStallion ? undefined : shipmentTrackingNumber.trim(),
        notes: shipmentNotes.trim() || undefined,
      }
      const isInboundToCoe = direction === 'inbound'
      payload.from_address = isInboundToCoe ? buildShipToAddress(order) : COE_ADDRESS
      payload.to_address = isInboundToCoe ? COE_ADDRESS : buildShipToAddress(order)
      if (useStallion) {
        payload.stallion_purchase = true
        payload.weight = Number.parseFloat(shipmentWeight) || 2
        payload.dimensions = {
          length: Number.parseFloat(shipmentDimensions.length) || 12,
          width: Number.parseFloat(shipmentDimensions.width) || 8,
          height: Number.parseFloat(shipmentDimensions.height) || 4,
        }
      }
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create shipment')
      toast.success(
        useStallion
          ? 'Shipment created and label purchased'
          : isVendor
            ? 'Shipment created and tracking uploaded'
            : 'Shipment created successfully'
      )
      setShipmentDialogOpen(false)
      setShipmentCarrier('FedEx')
      setShipmentCustomCarrier('')
      setShipmentTrackingNumber('')
      setShipmentNotes('')
      setShipmentStallionPurchase(false)
      setShipmentWeight('2')
      setShipmentDimensions({ length: '12', width: '8', height: '4' })
      refetch()
      refetchShipments()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create shipment')
    } finally {
      setIsCreatingShipment(false)
    }
  }

  const openShipmentDialog = () => {
    setShipmentDirection(isVendor ? 'inbound' : order?.type === 'trade_in' ? 'inbound' : 'outbound')
    setShipmentStallionPurchase(false)
    setShipmentCarrier('FedEx')
    setShipmentCustomCarrier('')
    setShipmentTrackingNumber('')
    setShipmentNotes('')
    setShipmentWeight('2')
    setShipmentDimensions({ length: '12', width: '8', height: '4' })
    setShipmentDialogOpen(true)
  }

  const handleCustomerShipDevices = async () => {
    if (!customerShipCarrier.trim() || !customerShipTracking.trim()) {
      toast.error('Carrier and tracking number are required')
      return
    }
    setIsCustomerShipping(true)
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: params.id,
          direction: 'inbound',
          carrier: customerShipCarrier.trim(),
          tracking_number: customerShipTracking.trim(),
          notes: customerShipNotes.trim() || undefined,
          from_address: {},
          to_address: COE_ADDRESS,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create shipment')
      toast.success('Shipment submitted! We\'ll track your package.')
      setCustomerShipCarrier('FedEx')
      setCustomerShipTracking('')
      setCustomerShipNotes('')
      refetch()
      refetchShipments()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit shipment')
    } finally {
      setIsCustomerShipping(false)
    }
  }

  // --- Vendor Assignment & Bid Handlers ---

  const fetchVendorsList = async () => {
    setVendorsLoading(true)
    try {
      const res = await fetch('/api/vendors?page_size=100&is_active=true')
      if (res.ok) {
        const payload = await res.json()
        setVendorsList((payload.data || []) as Vendor[])
      }
    } catch {
      // ignore
    } finally {
      setVendorsLoading(false)
    }
  }

  const openAssignVendorDialog = () => {
    setSelectedVendorId('')
    setAssignVendorDialogOpen(true)
    fetchVendorsList()
  }

  const handleAssignVendor = async () => {
    if (!selectedVendorId || !order?.id) return
    setIsAssigningVendor(true)
    try {
      // PATCH the order to set vendor_id
      const patchRes = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: selectedVendorId }),
      })
      if (!patchRes.ok) {
        const errData = await patchRes.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to assign vendor')
      }

      // Transition to sourcing if currently in accepted status
      if (order.status === 'accepted') {
        try {
          await transition({ status: 'sourcing' as OrderStatus, notes: 'Vendor assigned' })
        } catch {
          // Transition may not be valid from current status — not fatal
        }
      }

      toast.success('Vendor assigned successfully')
      setAssignVendorDialogOpen(false)
      refetch()
      fetchVendorBids()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign vendor')
    } finally {
      setIsAssigningVendor(false)
    }
  }

  const fetchVendorBids = useCallback(async () => {
    if (!order?.id || isCustomer || isVendor) return
    setVendorBidsLoading(true)
    try {
      const res = await fetch(`/api/vendors/bids?order_id=${order.id}`)
      if (res.ok) {
        const payload = await res.json()
        setVendorBids((payload.data || []) as VendorBid[])
      }
    } catch {
      // ignore
    } finally {
      setVendorBidsLoading(false)
    }
  }, [order?.id, isCustomer, isVendor])

  useEffect(() => {
    fetchVendorBids()
  }, [fetchVendorBids])

  // Fetch pending exceptions for customer approval
  const fetchPendingExceptions = useCallback(async () => {
    if (!order?.id || !isCustomer) return
    setExceptionsLoading(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/exceptions`)
      if (res.ok) {
        const data = await res.json()
        setPendingExceptions((data.data || []) as TriageResult[])
      }
    } catch {
      setPendingExceptions([])
    } finally {
      setExceptionsLoading(false)
    }
  }, [order?.id, isCustomer])

  useEffect(() => {
    fetchPendingExceptions()
  }, [fetchPendingExceptions])

  const handleExceptionDecision = async (triageResultId: string, approved: boolean) => {
    setExceptionProcessingId(triageResultId)
    try {
      const res = await fetch(`/api/triage/${triageResultId}/exception`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      })
      if (!res.ok) throw new Error()
      toast.success(approved ? 'Device condition approved' : 'Device condition rejected')
      setPendingExceptions(prev => prev.filter(e => e.id !== triageResultId))
      refetch()
    } catch {
      toast.error('Failed to update device condition')
    } finally {
      setExceptionProcessingId(null)
    }
  }

  const handleAcceptBid = async () => {
    if (!selectedBid) return
    setIsBidActionLoading(true)
    try {
      const res = await fetch(`/api/vendors/bids/${selectedBid.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'accepted',
          cpo_markup_percent: parseFloat(bidMarkupPercent) || 15,
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to accept bid')
      }
      toast.success('Bid accepted — prices updated with markup')
      setAcceptBidDialogOpen(false)
      setSelectedBid(null)
      refetch()
      fetchVendorBids()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to accept bid')
    } finally {
      setIsBidActionLoading(false)
    }
  }

  const handleRejectBid = async () => {
    if (!selectedBid) return
    setIsBidActionLoading(true)
    try {
      const res = await fetch(`/api/vendors/bids/${selectedBid.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to reject bid')
      }
      toast.success('Bid rejected')
      setRejectBidDialogOpen(false)
      setSelectedBid(null)
      fetchVendorBids()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reject bid')
    } finally {
      setIsBidActionLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Order not found</p>
        <Link href={getDefaultAppPathForRole(user?.role)}><Button variant="outline" className="mt-4">Back</Button></Link>
      </div>
    )
  }

  const backHref = isVendor ? '/vendor/orders' : isCustomer ? '/customer/orders' : '/orders'
  const statusConfig = isCustomer
    ? CUSTOMER_STATUS_CONFIG[order.status]
    : ORDER_STATUS_CONFIG[order.status]
  const rawTransitions = VALID_ORDER_TRANSITIONS[order.status] || []
  const canViewCommercials = !isVendor
  const orderTotal = order.quoted_amount ?? order.total_amount ?? 0
  const computedFromItems = order.items?.reduce((sum, i) => sum + ((i.unit_price ?? 0) * (i.quantity ?? 0)), 0) ?? 0
  const hasPricesForQuote = orderTotal > 0 || computedFromItems > 0
  const mismatchedItemCount = order.items?.filter((item) => item.actual_condition && item.claimed_condition && item.actual_condition !== item.claimed_condition).length || 0
  const vendorHasTracking = orderShipments.some((shipment) => shipment.direction === 'inbound' && !!shipment.tracking_number)
  // Customer can only: submit (draft->submitted), cancel draft, accept/reject quote
  const customerAllowedTransitions: OrderStatus[] =
    order.status === 'draft' ? ['submitted', 'cancelled'] :
    order.status === 'quoted' ? ['accepted', 'rejected'] : []
  const vendorAllowedTransitions: OrderStatus[] =
    order.status === 'accepted' ? ['sourcing'] :
    order.status === 'sourcing' ? ['sourced'] :
    order.status === 'sourced' ? (vendorHasTracking ? ['shipped'] : []) :
    order.status === 'shipped' ? ['delivered'] :
    order.status === 'delivered' ? ['closed'] : []
  const canVendorCreateShipment = isVendor && ['sourced', 'shipped'].includes(order.status)
  const showLineItemPrices = !isVendor
  const showLineItemSuggestions = !isCustomer && !isVendor && canSetPricing && !isCpoOrder
  const showLineItemPricingSource = !isCustomer && !isVendor && (((order.items ?? []).some((i: OrderItem) => i.pricing_metadata?.pricing_source)) || order.status === 'submitted' || order.status === 'quoted')
  const lineItemColSpan =
    3 +
    (showLineItemPrices ? 2 : 0) +
    (showLineItemSuggestions ? 1 : 0) +
    (showLineItemPricingSource ? 1 : 0)
  const availableTransitions = isCustomer
    ? rawTransitions.filter((s: OrderStatus) => customerAllowedTransitions.includes(s))
    : isVendor
      ? rawTransitions.filter((s: OrderStatus) => vendorAllowedTransitions.includes(s))
    // 'sourcing' is only valid for CPO orders — hide it from trade-in / other types
      : rawTransitions.filter((s: OrderStatus) =>
        (s !== 'sourcing' || isCpoOrder) &&
        !(order.status === 'sourced' && s === 'shipped')
      )

  // Build timeline from order timestamps
  const timeline = [
    { status: 'Created', date: order.created_at, done: true },
    order.submitted_at && { status: 'Submitted', date: order.submitted_at, done: true },
    order.quoted_at && { status: 'Quoted', date: order.quoted_at, done: true },
    order.accepted_at && { status: 'Accepted', date: order.accepted_at, done: true },
    order.shipped_at && { status: 'Shipped', date: order.shipped_at, done: true },
    order.received_at && { status: 'Received', date: order.received_at, done: true },
    order.completed_at && { status: 'Completed', date: order.completed_at, done: true },
  ].filter(Boolean) as { status: string; date: string; done: boolean }[]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <Link href={backHref}><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold whitespace-nowrap">{order.order_number}</h1>
            <Badge variant="outline" className="capitalize">{order.type.replace('_', ' ')}</Badge>
            <StatusBadge status={order.status} label={statusConfig?.label} dot />
            {!isCustomer && order.is_sla_breached && (
              <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />SLA Breached</Badge>
            )}
          </div>
          <p className="text-muted-foreground">{statusConfig?.description}</p>
        </div>
      </div>

      {/* Quote ready — customer accepts or rejects */}
      {isCustomer && order.status === 'quoted' && (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20">
          <CardContent className="py-4">
            <p className="font-medium text-green-800 dark:text-green-200">Quote ready for your review</p>
            <p className="text-sm text-green-700 dark:text-green-300/90 mt-1">
              Your quote total is {formatCurrency(order.quoted_amount || order.total_amount || 0)}. Approve to proceed or disapprove if you&apos;d like to decline.
            </p>
            {isCpoOrder && (order.items ?? []).some((i: OrderItem) => (i.guaranteed_buyback_price ?? 0) > 0) && (
              <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Buyback Guarantee Included
                </p>
                <div className="mt-2 space-y-1">
                  {(order.items ?? []).filter((i: OrderItem) => (i.guaranteed_buyback_price ?? 0) > 0).map((item: OrderItem) => {
                    const schedule = (displaySchedule ?? depreciationSchedule)?.items.find(s => s.id === item.id)
                    const year3Value = schedule?.schedule.find(r => r.year === 3)?.value
                    return (
                      <p key={item.id} className="text-sm text-green-700 dark:text-green-300/90">
                        {item.device ? `${item.device.make} ${item.device.model}` : 'Device'}{item.storage ? ` · ${item.storage}` : ''}
                        {' — '}
                        <span className="font-semibold">Up to {formatCurrency(year3Value ?? item.guaranteed_buyback_price! * 0.614)}</span>
                        {' buyback value after 3 years'}
                      </p>
                    )
                  })}
                </div>
              </div>
            )}
            <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-2">
              {isCpoOrder ? 'This quote is valid for 30 days.' : 'This quote combines automated market pricing with team-verified adjustments.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Device condition needs approval — customer can approve/reject inspected condition */}
      {isCustomer && exceptionsLoading && (
        <Card className="border-amber-200 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-950/10">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Checking for items needing your approval...</span>
            </div>
          </CardContent>
        </Card>
      )}
      {isCustomer && !exceptionsLoading && pendingExceptions.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Device condition needs your approval
            </CardTitle>
            <CardDescription>
              We inspected your device(s) and found a different condition than reported. Please review and approve or reject each item.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingExceptions.map((exc) => {
              const imei = exc.imei_record as unknown as Record<string, unknown> | null
              const claimedLabel = imei?.claimed_condition ? (CONDITION_CONFIG[imei.claimed_condition as keyof typeof CONDITION_CONFIG]?.label || String(imei.claimed_condition)) : '—'
              const actualLabel = exc.final_condition ? (CONDITION_CONFIG[exc.final_condition as keyof typeof CONDITION_CONFIG]?.label || String(exc.final_condition)) : '—'
              const dev = imei?.device as { make?: string; model?: string } | undefined
              const deviceName = dev ? `${dev.make || ''} ${dev.model || ''}`.trim() || (imei?.imei ? `IMEI: ${imei.imei}` : 'Device') : (imei?.imei ? `IMEI: ${String(imei.imei)}` : 'Device')
              const isProcessing = exceptionProcessingId === exc.id
              return (
                <div key={exc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border bg-background p-3">
                  <div>
                    <p className="font-medium text-sm">{deviceName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You reported: <span className="font-medium">{String(claimedLabel)}</span>
                      {' → '}Inspected: <span className="font-medium">{String(actualLabel)}</span>
                      {exc.price_adjustment != null && exc.price_adjustment !== 0 && (
                        <span className="ml-2">
                          ({exc.price_adjustment > 0 ? '+' : ''}{formatCurrency(exc.price_adjustment)})
                        </span>
                      )}
                    </p>
                    {exc.exception_reason && (
                      <p className="text-xs text-muted-foreground mt-1">{exc.exception_reason}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      disabled={isProcessing}
                      onClick={() => handleExceptionDecision(exc.id, true)}
                    >
                      {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                      <span className="ml-1.5">Approve</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isProcessing}
                      onClick={() => handleExceptionDecision(exc.id, false)}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      <span className="ml-1.5">Reject</span>
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Quote awaiting admin verification — submitted orders with auto prices */}
      {!isCustomer && !isVendor && order.status === 'submitted' && hasPricesForQuote && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <p className="font-medium text-amber-800 dark:text-amber-200">Quote ready for verification</p>
            <p className="text-sm text-amber-700 dark:text-amber-300/90 mt-1">
              Auto-pricing has been applied. Review prices above, adjust if needed, then click &quot;Send Quote&quot; to send to the customer.
            </p>
          </CardContent>
        </Card>
      )}

      {isVendor && order.status === 'sourced' && !vendorHasTracking && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20">
          <CardContent className="py-4">
            <p className="font-medium text-blue-800 dark:text-blue-200">Upload tracking before marking this order as shipped</p>
            <p className="text-sm text-blue-700 dark:text-blue-300/90 mt-1">
              Add the inbound tracking number to COE first, then the shipment action will unlock.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Parent order banner (shown for sub-orders, hidden from customers) */}
      {!isCustomer && order.parent_order_id && order.parent_order && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="flex items-center gap-3 py-3">
            <GitBranch className="h-4 w-4 text-blue-600" />
            <span className="text-sm">
              This is a sub-order of{' '}
              <Link href={`/orders/${order.parent_order_id}`} className="font-medium text-blue-600 hover:underline">
                {order.parent_order.order_number}
              </Link>
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Info */}
          <Card>
            <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {!isCustomer && !isVendor && (
                  <div>
                    <p className="text-sm text-muted-foreground">Customer</p>
                    <p className="font-medium">{order.customer?.company_name || '—'}</p>
                  </div>
                )}
                {!isCustomer && (
                  <div>
                    <p className="text-sm text-muted-foreground">Vendor</p>
                    <p className="font-medium">{order.vendor?.company_name || '—'}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Total Quantity</p>
                  <p className="font-medium">{order.total_quantity} devices</p>
                </div>
                {canViewCommercials && (
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="font-medium">{formatCurrency(order.total_amount || 0)}</p>
                  </div>
                )}
                {canViewCommercials && order.quoted_amount && (
                  <div>
                    <p className="text-sm text-muted-foreground">Quoted Amount</p>
                    <p className="font-medium">{formatCurrency(order.quoted_amount)}</p>
                  </div>
                )}
                {canViewCommercials && order.final_amount && (
                  <div>
                    <p className="text-sm text-muted-foreground">Final Amount</p>
                    <p className="font-medium text-green-600">{formatCurrency(order.final_amount)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card>
            <CardHeader className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <CardTitle>Line Items</CardTitle>
                {canSetPricing && canSendQuote && !isCpoOrder && (order.status === 'draft' || order.status === 'submitted') && order.items && order.items.length > 0 && (
                  <>
                    {!isInlineEditing ? (
                      <Button variant="outline" size="sm" onClick={handleEditAndSendQuote}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit & Send Quote
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setIsInlineEditing(false)} disabled={isSavingPrices || isSendingQuote}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveAndSendQuote} disabled={isSavingPrices || isSendingQuote}>
                          {(isSavingPrices || isSendingQuote) ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5 mr-1" />
                          )}
                          {isSavingPrices || isSendingQuote ? 'Saving...' : 'Save & Send Quote'}
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
              {canViewCommercials && order.items && order.items.length > 0 && (order.quoted_amount ?? order.total_amount ?? 0) > 0 && (() => {
                const autoCount = order.items.filter((i: OrderItem) => i.pricing_metadata?.pricing_source === 'auto').length
                const manualCount = order.items.filter((i: OrderItem) => i.pricing_metadata?.pricing_source === 'manual').length
                const hasBoth = autoCount > 0 && manualCount > 0
                return hasBoth && (
                  <p className="text-sm text-muted-foreground font-normal">
                    Quote includes <span className="text-primary font-medium">auto</span> and <span className="text-primary font-medium">manual</span> pricing
                  </p>
                )
              })()}
            </CardHeader>
            <CardContent>
              {order.items && order.items.length > 0 ? (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Condition</TableHead>
                      {showLineItemPrices && <TableHead>Unit Price</TableHead>}
                      {showLineItemSuggestions && (
                        <TableHead className="w-36">Suggested</TableHead>
                      )}
                      {showLineItemPricingSource && (
                        <TableHead className="w-24">Pricing</TableHead>
                      )}
                      {showLineItemPrices && <TableHead className="text-right">Total</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map(item => {
                      const meta = item.pricing_metadata
                      const hasContext = meta?.suggested_by_calc
                      const isExpanded = expandedPricingContext === item.id
                      return (
                        <Fragment key={item.id}>
                          <TableRow>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1">
                                {(hasContext || item.imei || item.serial_number || item.cpu || item.accessories) && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedPricingContext(isExpanded ? null : item.id)}
                                    className="text-muted-foreground hover:text-foreground p-0.5 -ml-1"
                                    aria-expanded={isExpanded}
                                  >
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </button>
                                )}
                                {item.device ? `${item.device.make} ${item.device.model}` : 'Unknown Device'}
                                {item.device?.variant && <span className="text-muted-foreground ml-1">({item.device.variant})</span>}
                                {item.colour && <span className="text-muted-foreground ml-1">· {item.colour}</span>}
                              </div>
                              {(item.imei || item.serial_number) && (
                                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                  {item.imei && `IMEI: ${item.imei}`}
                                  {item.imei && item.serial_number && ' · '}
                                  {item.serial_number && `S/N: ${item.serial_number}`}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>
                              {item.claimed_condition && (
                                <div className="flex items-center gap-2">
                                  <span className={CONDITION_CONFIG[item.claimed_condition]?.color}>
                                    {CONDITION_CONFIG[item.claimed_condition]?.label}
                                  </span>
                                  {item.actual_condition && item.actual_condition !== item.claimed_condition && (
                                    <span className="text-xs text-amber-600 dark:text-amber-400">
                                      → {CONDITION_CONFIG[item.actual_condition]?.label || item.actual_condition}
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            {showLineItemPrices && (
                              <TableCell>
                                {isInlineEditing && canSetPricing ? (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="w-24 h-8 text-sm"
                                    value={inlineEditPrices[item.id] ?? item.unit_price ?? ''}
                                    onChange={(e) => setInlineEditPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                                  />
                                ) : (
                                  item.unit_price ? formatCurrency(item.unit_price) : '—'
                                )}
                              </TableCell>
                            )}
                            {showLineItemSuggestions && (
                              <TableCell>
                                {lineItemSuggestionsLoading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                ) : lineItemSuggestions[item.id] != null ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-mono text-muted-foreground">
                                      {formatCurrency(lineItemSuggestions[item.id])}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-1.5 text-xs"
                                      onClick={() => {
                                        if (isInlineEditing) {
                                          setInlineEditPrices(prev => ({ ...prev, [item.id]: lineItemSuggestions[item.id].toFixed(2) }))
                                        } else {
                                          handleOpenPricingDialog({ [item.id]: lineItemSuggestions[item.id].toFixed(2) })
                                        }
                                      }}
                                    >
                                      Use
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            )}
                            {showLineItemPricingSource && (
                              <TableCell>
                                {item.pricing_metadata?.pricing_source === 'auto' ? (
                                  <Badge variant="secondary" className="text-xs">Auto</Badge>
                                ) : item.pricing_metadata?.pricing_source === 'manual' ? (
                                  <Badge variant="outline" className="text-xs">Manual</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            )}
                            {showLineItemPrices && (
                              <TableCell className="text-right">
                                {(() => {
                                  const unit = isInlineEditing
                                    ? parseFloat(String(inlineEditPrices[item.id] ?? item.unit_price ?? '').replace(/[^0-9.-]/g, ''))
                                    : (item.unit_price ?? 0)
                                  const total = (Number.isFinite(unit) ? unit : 0) * (item.quantity ?? 1)
                                  return total > 0 ? formatCurrency(total) : '—'
                                })()}
                              </TableCell>
                            )}
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={lineItemColSpan} className="bg-muted/30 py-3">
                                <div className="text-sm text-muted-foreground space-y-2 pl-6">
                                  {/* Extended device metadata */}
                                  {(item.cpu || item.ram || item.screen_size || item.year || item.model_number || item.accessories || item.faults) && (
                                    <div>
                                      <p className="font-medium mb-1">Device Details</p>
                                      <div className="flex flex-wrap gap-4">
                                        {item.model_number && <span>Model #: {item.model_number}</span>}
                                        {item.year && <span>Year: {item.year}</span>}
                                        {item.cpu && <span>CPU: {item.cpu}</span>}
                                        {item.ram && <span>RAM: {item.ram}</span>}
                                        {item.screen_size && <span>Screen: {item.screen_size}</span>}
                                      </div>
                                      {item.accessories && <p className="mt-1">Accessories: {item.accessories}</p>}
                                      {item.faults && <p className="mt-1 text-amber-600 dark:text-amber-400">Faults: {item.faults}</p>}
                                    </div>
                                  )}
                                  {/* Pricing context */}
                                  {!isVendor && hasContext && (
                                    <div>
                                      <p className="font-medium mb-1">Pricing Context</p>
                                      <div className="flex flex-wrap gap-4">
                                        {meta?.margin_tier && <span>Margin tier: {meta.margin_tier}</span>}
                                        {meta?.confidence != null && <span>Confidence: {Math.round(meta.confidence * 100)}%</span>}
                                        {meta?.anchor_price != null && <span>Anchor: {formatCurrency(meta.anchor_price)}</span>}
                                        {meta?.channel_decision && <span>Channel: {meta.channel_decision}</span>}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
                </div>
              ) : (
                <p className="text-center py-4 text-muted-foreground">No items added yet</p>
              )}
            </CardContent>
          </Card>

          {/* Buyback Guarantee (CPO only, admin) */}
          {isCpoOrder && canSetPricing && !isCustomer && order.items && order.items.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" /> Buyback Guarantee
                  </CardTitle>
                  <CardDescription>
                    Guarantee we&apos;ll buy devices back at this price (valid 24 months from quote)
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCalculateBuyback}
                  disabled={isCalculatingBuyback}
                >
                  {isCalculatingBuyback ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Calculate Buyback
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Guaranteed Buyback</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Valid Until</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item: OrderItem) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.device ? `${item.device.make} ${item.device.model}` : 'Unknown'}
                          {item.storage && <span className="text-muted-foreground ml-1">· {item.storage}</span>}
                        </TableCell>
                        <TableCell>
                          {item.guaranteed_buyback_price != null && item.guaranteed_buyback_price > 0 ? (
                            <span className="flex items-center gap-2">
                              {formatCurrency(item.guaranteed_buyback_price)}
                              {depreciationSchedule?.items.find(s => s.id === item.id)?.is_estimated && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 font-medium">estimated</span>
                              )}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {item.buyback_condition
                            ? (CONDITION_CONFIG[item.buyback_condition]?.label ?? item.buyback_condition)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.buyback_valid_until
                            ? new Date(item.buyback_valid_until).toLocaleDateString('en-US', { timeZone: 'America/Toronto' })
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!(order.items ?? []).some((i: OrderItem) => (i.guaranteed_buyback_price ?? 0) > 0) && (
                  <p className="text-sm text-muted-foreground mt-3">
                    Click &quot;Calculate Buyback&quot; to generate guaranteed prices from trade-in logic.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Buyback Guarantee & Depreciation Schedule (CPO only, internal roles only — customers see "up to" in quote banner) */}
          {isCpoOrder && !isCustomer && !isVendor && (displaySchedule ?? depreciationSchedule) && (displaySchedule ?? depreciationSchedule)!.items.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingDown className="h-4 w-4" /> Buyback Guarantee &amp; Depreciation Schedule
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Projected device values over {(displaySchedule ?? depreciationSchedule)!.years} years at {(displaySchedule ?? depreciationSchedule)!.rate}% annual depreciation.
                      {!canSetPricing && ' Prices marked &quot;estimated&quot; are derived from internal data when no live market price is available.'}
                    </CardDescription>
                  </div>
                  {canSetPricing && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Label htmlFor="depreciation-rate-edit" className="text-sm whitespace-nowrap">Annual Depreciation (%)</Label>
                      <Input
                        id="depreciation-rate-edit"
                        type="number"
                        min={0}
                        max={50}
                        step={0.5}
                        className="w-20"
                        value={editableDepreciationRate}
                        onChange={(e) => setEditableDepreciationRate(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveDepreciation}
                        disabled={isSavingDepreciation}
                      >
                        {isSavingDepreciation ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {(displaySchedule ?? depreciationSchedule)!.items.map((depItem) => {
                  const device = (order.items ?? []).find((i: OrderItem) => i.id === depItem.id)
                  const deviceLabel = device?.device
                    ? `${device.device.make} ${device.device.model}${device.device.variant ? ` (${device.device.variant})` : ''}`
                    : depItem.device_id
                  return (
                    <div key={depItem.id} className="mb-6 last:mb-0">
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        {deviceLabel} — Original: {formatCurrency(depItem.guaranteed_buyback_price)}
                        {depItem.is_estimated && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 font-medium" title={`Source: ${depItem.price_source ?? 'internal estimate'}`}>estimated</span>
                        )}
                      </p>
                      <div className="rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[80px]">Year</TableHead>
                              <TableHead>Projected Value</TableHead>
                              <TableHead>% of Original</TableHead>
                              <TableHead>Annual Depreciation</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {depItem.schedule.map((row, idx) => (
                              <TableRow key={row.year} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                                <TableCell className="font-medium">{row.year === 0 ? 'Now' : `Year ${row.year}`}</TableCell>
                                <TableCell>{formatCurrency(row.value)}</TableCell>
                                <TableCell>{(100 - row.depreciation_pct).toFixed(1)}%</TableCell>
                                <TableCell>
                                  {row.year === 0
                                    ? '—'
                                    : `${formatCurrency(depItem.schedule[row.year - 1].value - row.value)} (${(displaySchedule ?? depreciationSchedule)!.rate}%)`}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* Vendor Bids Section (CPO orders, internal roles only) */}
          {!isCustomer && !isVendor && isCpoOrder && (vendorBids.length > 0 || vendorBidsLoading) && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Vendor Bids</CardTitle>
                    <CardDescription>
                      {vendorBids.length} bid{vendorBids.length !== 1 ? 's' : ''} received for this order
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchVendorBids} disabled={vendorBidsLoading}>
                    {vendorBidsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {vendorBidsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading bids...
                  </div>
                ) : vendorBids.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No bids yet.</p>
                ) : (
                  <div className="space-y-3">
                    {vendorBids.map((bid) => {
                      const isAccepted = bid.status === 'accepted'
                      const isRejected = bid.status === 'rejected'
                      const isPending = bid.status === 'pending'
                      const statusBadgeClass = isAccepted
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : isRejected
                          ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                      return (
                        <div key={bid.id} className="rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <p className="font-medium">
                                {bid.vendor?.company_name || 'Unknown Vendor'}
                              </p>
                              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                <span>Qty: {bid.quantity}</span>
                                <span>Unit Price: {formatCurrency(bid.unit_price)}</span>
                                <span>Total: {formatCurrency(bid.total_price)}</span>
                                <span>Lead Time: {bid.lead_time_days} days</span>
                                {bid.warranty_days && <span>Warranty: {bid.warranty_days} days</span>}
                              </div>
                              {bid.notes && (
                                <p className="text-xs text-muted-foreground mt-1">{bid.notes}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusBadgeClass}`}>
                                {bid.status}
                              </span>
                              {isPending && canSetPricingByRole && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-950"
                                    onClick={() => {
                                      setSelectedBid(bid)
                                      setBidMarkupPercent('15')
                                      setAcceptBidDialogOpen(true)
                                    }}
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                                    Accept
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950"
                                    onClick={() => {
                                      setSelectedBid(bid)
                                      setRejectBidDialogOpen(true)
                                    }}
                                  >
                                    <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                                    Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {!isVendor && (order.notes || (!isCustomer && order.internal_notes)) && (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {order.notes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Customer Notes</p>
                    <p className="text-sm">{order.notes}</p>
                  </div>
                )}
                {!isCustomer && order.internal_notes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Internal Notes</p>
                    <p className="text-sm">{order.internal_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Shipments / Track Shipment Section */}
          {(orderShipments.length > 0 || (!isVendor && SHIPMENT_STATUSES.includes(order.status as (typeof SHIPMENT_STATUSES)[number])) || (isCustomer && order.status === 'accepted') || canVendorCreateShipment) && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <CardTitle>{isCustomer ? 'Track Your Shipment' : 'Shipments'}</CardTitle>
                  </div>
                  {((!isVendor && (
                    (!isCustomer && SHIPMENT_STATUSES.includes(order.status as (typeof SHIPMENT_STATUSES)[number])) ||
                    (isCustomer && order.status === 'accepted')
                  )) || canVendorCreateShipment) && (
                    <Button size="sm" onClick={openShipmentDialog}>
                      <Plus className="h-4 w-4 mr-1" />
                      {isVendor ? 'Upload Tracking' : 'Create Shipment'}
                    </Button>
                  )}
                </div>
                {orderShipments.length > 0 && (
                  <CardDescription>
                    {orderShipments.length} shipment{orderShipments.length !== 1 ? 's' : ''} for this order
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {orderShipments.length === 0 ? (
                  <div className="flex items-center justify-center rounded-lg border-2 border-dashed p-8">
                    <p className="text-sm text-muted-foreground">
                      {isCustomer
                        ? 'Tracking info will appear here when your order is shipped.'
                        : isVendor
                          ? 'Upload the vendor shipment tracking number once devices leave your facility.'
                        : 'No shipments yet. Create one to start the shipping process.'}
                    </p>
                  </div>
                ) : (
                <div className="space-y-3">
                  {orderShipments.map(shipment => {
                    const statusColor: Record<string, string> = {
                      label_created: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                      picked_up: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                      in_transit: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
                      out_for_delivery: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
                      delivered: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                      exception: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                    }
                    const trackingUrl = getCarrierTrackingUrl(shipment.carrier, shipment.tracking_number)
                    return (
                      <div key={shipment.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-mono font-medium">{shipment.tracking_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {shipment.carrier} · {shipment.direction}
                              {shipment.estimated_delivery && ` · ETA ${formatDateTime(shipment.estimated_delivery)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[shipment.status] || ''}`}>
                            {shipment.status.replace(/_/g, ' ')}
                          </span>
                          {trackingUrl && (
                            <a href={trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                              <ExternalLink className="h-3 w-3" />
                              Track
                            </a>
                          )}
                          {shipment.label_pdf_url && (
                            <a href={shipment.label_pdf_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                              Label
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Create Shipment Dialog */}
          <Dialog open={shipmentDialogOpen} onOpenChange={setShipmentDialogOpen}>
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{isVendor ? 'Upload Tracking' : 'Create Shipment'}</DialogTitle>
                <DialogDescription>
                  {isVendor
                    ? `Upload the carrier and tracking number for order ${order.order_number}`
                    : `Add tracking for order ${order.order_number}. Manual entry works with any carrier or shipping platform.`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {isVendor ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-sm font-medium">Direction</p>
                    <p className="text-xs text-muted-foreground mt-1">Inbound to COE</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="shipment-direction">Direction</Label>
                    <Select value={shipmentDirection} onValueChange={(v) => {
                      setShipmentDirection(v as 'inbound' | 'outbound')
                    }}>
                      <SelectTrigger id="shipment-direction">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inbound">Inbound</SelectItem>
                        <SelectItem value="outbound">Outbound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="shipment-carrier">Carrier or Platform</Label>
                  <Select value={shipmentCarrier} onValueChange={setShipmentCarrier}>
                    <SelectTrigger id="shipment-carrier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIPMENT_CARRIERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {shipmentCarrier === 'Other' && (
                  <div className="space-y-2">
                    <Label htmlFor="shipment-custom-carrier">Custom Carrier / Platform</Label>
                    <Input
                      id="shipment-custom-carrier"
                      placeholder="Enter carrier or platform name"
                      value={shipmentCustomCarrier}
                      onChange={(e) => setShipmentCustomCarrier(e.target.value)}
                    />
                  </div>
                )}
                {isVendor ? (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Manual tracking upload</p>
                    <p className="text-xs text-muted-foreground">Enter the tracking number from any carrier or platform. Vendors do not purchase labels in the app.</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Use in-app label purchase</p>
                      <p className="text-xs text-muted-foreground">Optional. Leave this off if you already have tracking from another platform.</p>
                    </div>
                    <Switch checked={shipmentStallionPurchase} onCheckedChange={setShipmentStallionPurchase} />
                  </div>
                )}
                {shipmentStallionPurchase && shipmentCarrier === 'Other' && (
                  <p className="text-xs text-amber-600">
                    Choose a listed carrier for in-app label purchase, or turn it off and paste tracking from your platform.
                  </p>
                )}
                {!shipmentStallionPurchase && (
                  <div className="space-y-2">
                    <Label htmlFor="shipment-tracking">Tracking Number</Label>
                    <Input
                      id="shipment-tracking"
                      placeholder="Enter tracking number from any carrier or platform"
                      value={shipmentTrackingNumber}
                      onChange={(e) => setShipmentTrackingNumber(e.target.value)}
                    />
                  </div>
                )}
                {shipmentStallionPurchase && !isVendor && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Weight (lb)</Label>
                      <Input value={shipmentWeight} onChange={(e) => setShipmentWeight(e.target.value)} placeholder="2" />
                    </div>
                    <div className="space-y-2">
                      <Label>Length (in)</Label>
                      <Input value={shipmentDimensions.length} onChange={(e) => setShipmentDimensions(d => ({ ...d, length: e.target.value }))} placeholder="12" />
                    </div>
                    <div className="space-y-2">
                      <Label>Width (in)</Label>
                      <Input value={shipmentDimensions.width} onChange={(e) => setShipmentDimensions(d => ({ ...d, width: e.target.value }))} placeholder="8" />
                    </div>
                    <div className="space-y-2">
                      <Label>Height (in)</Label>
                      <Input value={shipmentDimensions.height} onChange={(e) => setShipmentDimensions(d => ({ ...d, height: e.target.value }))} placeholder="4" />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="shipment-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    id="shipment-notes"
                    placeholder="Any additional notes..."
                    value={shipmentNotes}
                    onChange={(e) => setShipmentNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShipmentDialogOpen(false)} disabled={isCreatingShipment}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateShipment}
                  disabled={
                    isCreatingShipment ||
                    !(shipmentCarrier === 'Other' ? shipmentCustomCarrier.trim() : shipmentCarrier.trim()) ||
                    (shipmentStallionPurchase && shipmentCarrier === 'Other') ||
                    (shipmentStallionPurchase ? false : !shipmentTrackingNumber.trim())
                  }
                >
                  {isCreatingShipment ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Truck className="h-4 w-4 mr-1" />}
                  {isVendor ? 'Upload Tracking' : shipmentStallionPurchase ? 'Create Shipment' : 'Save Tracking'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Mismatch Dialog — admin records devices that were received in different condition */}
          <Dialog open={addMismatchDialogOpen} onOpenChange={setAddMismatchDialogOpen}>
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Mismatched Device(s)</DialogTitle>
                <DialogDescription>
                  Record devices that were received in a different condition than quoted. These will be linked to triage and appear in COE Exceptions for customer approval when price adjustment exceeds $50.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">For each device, select the actual condition received (must differ from claimed):</p>
                <div className="space-y-3 max-h-[320px] overflow-y-auto">
                  {order?.items
                    ?.filter((item) => !(item.actual_condition && item.claimed_condition && item.actual_condition !== item.claimed_condition))
                    .map((item) => {
                      const claimed = item.claimed_condition || 'good'
                      const deviceLabel = item.device ? `${item.device.make} ${item.device.model}` : 'Unknown'
                      return (
                        <div key={item.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{deviceLabel}</p>
                            <p className="text-xs text-muted-foreground">Quoted: {CONDITION_CONFIG[claimed]?.label ?? claimed}</p>
                          </div>
                          <Select
                            value={addMismatchSelections[item.id] || ''}
                            onValueChange={(v) => setAddMismatchSelections((prev) => ({ ...prev, [item.id]: v }))}
                          >
                            <SelectTrigger className="w-full sm:w-[140px]">
                              <SelectValue placeholder="Actual condition" />
                            </SelectTrigger>
                            <SelectContent>
                              {(['new', 'excellent', 'good', 'fair', 'poor'] as const)
                                .filter((c) => c !== claimed)
                                .map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {CONDITION_CONFIG[c]?.label ?? c}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    })}
                </div>
                {(!order?.items?.length || order.items.every((i) => i.actual_condition && i.claimed_condition && i.actual_condition !== i.claimed_condition)) && (
                  <p className="text-sm text-muted-foreground">No devices available to add — all items are already marked as mismatched.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddMismatchDialogOpen(false)} disabled={isAddingMismatch}>
                  Cancel
                </Button>
                <Button onClick={handleAddMismatch} disabled={isAddingMismatch || Object.keys(addMismatchSelections).length === 0}>
                  {isAddingMismatch ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                  Add Mismatch
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Mismatch Dialog — admin records devices that were mismatched, linked to triage/exceptions */}
          <Dialog open={addMismatchDialogOpen} onOpenChange={setAddMismatchDialogOpen}>
            <DialogContent className="max-w-[95vw] sm:max-w-xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Mismatched Devices</DialogTitle>
                <DialogDescription>
                  Record devices that were received in a different condition than quoted. Each will be linked to triage and the exception workflow for customer approval when price adjustment exceeds $50.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {order?.items
                  ?.filter(
                    (item: OrderItem) =>
                      !item.actual_condition ||
                      !item.claimed_condition ||
                      item.actual_condition === item.claimed_condition
                  )
                  .map((item: OrderItem) => {
                    const claimed = item.claimed_condition || 'good'
                    const deviceLabel = item.device
                      ? `${item.device.make} ${item.device.model}${item.storage ? ` · ${item.storage}` : ''}`
                      : 'Unknown'
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-4 rounded-md border p-3">
                        <div>
                          <p className="font-medium text-sm">{deviceLabel}</p>
                          <p className="text-xs text-muted-foreground">Quoted: {CONDITION_CONFIG[claimed]?.label ?? claimed}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Label htmlFor={`actual-${item.id}`} className="text-sm">Actual condition</Label>
                          <Select
                            value={addMismatchSelections[item.id] || ''}
                            onValueChange={(v) => setAddMismatchSelections((prev) => ({ ...prev, [item.id]: v }))}
                          >
                            <SelectTrigger id={`actual-${item.id}`} className="w-32">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {(['new', 'excellent', 'good', 'fair', 'poor'] as const).map((c) => (
                                <SelectItem key={c} value={c} disabled={c === claimed}>
                                  {CONDITION_CONFIG[c]?.label ?? c}
                                  {c === claimed ? ' (same)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )
                  })}
                {(!order?.items?.length ||
                  order.items.every(
                    (i: OrderItem) =>
                      i.actual_condition && i.claimed_condition && i.actual_condition !== i.claimed_condition
                  )) && (
                  <p className="text-sm text-muted-foreground">No items available to add — all devices are already marked mismatched.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddMismatchDialogOpen(false)} disabled={isAddingMismatch}>
                  Cancel
                </Button>
                <Button onClick={handleAddMismatch} disabled={isAddingMismatch}>
                  {isAddingMismatch ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                  Add Mismatch
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Mismatch Dialog */}
          <Dialog open={addMismatchDialogOpen} onOpenChange={setAddMismatchDialogOpen}>
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Mismatched Devices</DialogTitle>
                <DialogDescription>
                  Record devices that were received in a different condition than quoted. These will be linked to triage and appear in COE Exceptions for customer approval.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground">Select the actual condition for each device (must differ from claimed):</p>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {(order?.items ?? []).filter((item) => !item.actual_condition || item.actual_condition === item.claimed_condition).map((item) => {
                    const claimed = item.claimed_condition || 'good'
                    const deviceLabel = item.device ? `${item.device.make} ${item.device.model}` : 'Unknown'
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-4 rounded-md border p-3">
                        <div>
                          <p className="font-medium text-sm">{deviceLabel}</p>
                          <p className="text-xs text-muted-foreground">Claimed: {CONDITION_CONFIG[claimed]?.label ?? claimed}</p>
                        </div>
                        <Select
                          value={addMismatchSelections[item.id] ?? ''}
                          onValueChange={(v) => setAddMismatchSelections((prev) => ({ ...prev, [item.id]: v }))}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Actual" />
                          </SelectTrigger>
                          <SelectContent>
                            {(['new', 'excellent', 'good', 'fair', 'poor'] as const)
                              .filter((c) => c !== claimed)
                              .map((c) => (
                                <SelectItem key={c} value={c}>
                                  {CONDITION_CONFIG[c]?.label ?? c}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })}
                </div>
                {(order?.items ?? []).filter((item) => !item.actual_condition || item.actual_condition === item.claimed_condition).length === 0 && (
                  <p className="text-sm text-muted-foreground">All devices already have a recorded mismatch or match their claimed condition.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddMismatchDialogOpen(false)} disabled={isAddingMismatch}>
                  Cancel
                </Button>
                <Button onClick={handleAddMismatch} disabled={isAddingMismatch || Object.keys(addMismatchSelections).length === 0}>
                  {isAddingMismatch ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                  Add Mismatch
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Mismatch Audit Trail */}
          {canSetPricing && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Mismatch Audit Trail</CardTitle>
                    <CardDescription>History of mismatch repricing and customer notice actions</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        setAddMismatchSelections({})
                        setAddMismatchDialogOpen(true)
                      }}
                      disabled={!order?.items?.length}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Mismatch
                    </Button>
                    <Button variant="outline" size="sm" onClick={fetchMismatchAuditLogs} disabled={mismatchAuditLoading}>
                      {mismatchAuditLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {mismatchAuditLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading mismatch audit trail...
                  </div>
                ) : mismatchAuditLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No mismatch audit events yet.</p>
                ) : (
                  <div className="space-y-3">
                    {mismatchAuditLogs.map((log) => {
                      const metadata = (log.metadata || {}) as {
                        event?: string
                        mismatched_count?: number
                        recommendation_count?: number
                        customer_email_sent?: boolean
                        customer_in_app_sent_to?: number
                        internal_in_app_sent_to?: number
                      }
                      const eventLabel = metadata.event === 'bulk_reprice_mismatches'
                        ? 'Bulk Reprice Mismatches'
                        : metadata.event === 'manual_mismatch_notice'
                          ? 'Manual Mismatch Notice'
                          : metadata.event === 'admin_added_mismatch'
                            ? 'Admin Added Mismatch'
                            : 'Mismatch Event'

                      return (
                        <div key={log.id || `${log.timestamp}-${metadata.event || 'event'}`} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">{eventLabel}</p>
                              <p className="text-xs text-muted-foreground">{formatDateTime(log.timestamp)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{snakeToTitle(log.action)}</Badge>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenPricingFromAudit(log)}
                              >
                                Open Pricing
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {metadata.mismatched_count != null && <span>Mismatched: {metadata.mismatched_count}</span>}
                            {metadata.recommendation_count != null && <span>Repriced: {metadata.recommendation_count}</span>}
                            {metadata.customer_email_sent != null && <span>Customer Email: {metadata.customer_email_sent ? 'Sent' : 'Not sent'}</span>}
                            {metadata.customer_in_app_sent_to != null && <span>Customer In-App: {metadata.customer_in_app_sent_to}</span>}
                            {metadata.internal_in_app_sent_to != null && <span>Internal In-App: {metadata.internal_in_app_sent_to}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Sub-Orders Section (shown for split parent orders, hidden from customers) */}
          {!isCustomer && order.is_split_order && order.sub_orders && order.sub_orders.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <CardTitle>Sub-Orders</CardTitle>
                </div>
                <CardDescription>
                  This order has been split into {order.sub_orders.length} sub-orders
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.sub_orders.map(sub => {
                      const subStatusConfig = ORDER_STATUS_CONFIG[sub.status]
                      const subItemCount = sub.items?.reduce((sum, i) => sum + i.quantity, 0) || 0
                      return (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium font-mono">{sub.order_number}</TableCell>
                          <TableCell>{sub.vendor?.company_name || '—'}</TableCell>
                          <TableCell>{subItemCount} units</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${subStatusConfig?.bgColor || ''} ${subStatusConfig?.color || ''}`}>
                              {subStatusConfig?.label || sub.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Link href={`/orders/${sub.id}`}>
                              <Button variant="ghost" size="sm">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
              <CardDescription>Manage this order</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Download PDF */}
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => {
                  const isQuote = ['draft', 'submitted', 'quoted'].includes(order.status)
                  window.open(`/api/orders/${order.id}/pdf`, '_blank')
                  toast.success(`${isQuote ? 'Quote' : 'Invoice'} download started`)
                }}
              >
                <span className="flex items-center gap-2">
                  <FileDown className="h-4 w-4" />
                  {['draft', 'submitted', 'quoted'].includes(order.status) ? 'Download Quote' : 'Download Invoice'}
                </span>
              </Button>

              {/* Pricing and Quote Actions — admin and coe_manager only */}
              {canSetPricing && order.status !== 'cancelled' && order.status !== 'closed' && (
                <>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => handleOpenPricingDialog()}
                  >
                    <span className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Set Pricing
                    </span>
                  </Button>
                  {mismatchedItemCount > 0 && (
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      onClick={handleSendMismatchNotice}
                      disabled={isSendingMismatchNotice}
                    >
                      <span className="flex items-center gap-2">
                        {isSendingMismatchNotice ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                        Send Mismatch Notice ({mismatchedItemCount})
                      </span>
                    </Button>
                  )}
                </>
              )}

              {/* Send Quote — available to internal staff when order has prices */}
              {canSendQuote && (order.status === 'draft' || order.status === 'submitted') && (
                <Button
                  size="lg"
                  className="w-full justify-between bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 hover:shadow-emerald-500/30 transition-all text-base font-semibold"
                  disabled={!hasPricesForQuote || isSendingQuote || isTransitioning}
                  title={!hasPricesForQuote ? 'Set pricing first to send quote' : undefined}
                  onClick={handleSendQuote}
                >
                  <span className="flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    {isSendingQuote ? 'Sending Quote...' : 'Send Quote'}
                  </span>
                  {!hasPricesForQuote && (
                    <span className="text-xs font-normal opacity-75">Set pricing first</span>
                  )}
                </Button>
              )}

              {/* Notify Customer of Price Change — internal roles only, quoted orders */}
              {canSendQuote && order.status === 'quoted' && (
                <>
                  <Separator className="my-2" />
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    disabled={isNotifyingPriceChange}
                    onClick={handleNotifyPriceChange}
                  >
                    <span className="flex items-center gap-2">
                      {isNotifyingPriceChange ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {isNotifyingPriceChange ? 'Sending...' : 'Notify Customer of Price Change'}
                    </span>
                  </Button>
                </>
              )}

              {/* Split Order Button — admin and coe_manager only */}
              {canSetPricing && order.status === 'sourcing' && !order.is_split_order && !order.parent_order_id && (
                <>
                  <Separator className="my-2" />
                  <Link href={`/orders/${order.id}/split`}>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        Split Across Vendors
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </>
              )}

              {/* Assign Vendor — admin/coe_manager on CPO orders in submitted or sourcing */}
              {canSetPricingByRole && isCpoOrder && ['submitted', 'sourcing', 'accepted'].includes(order.status) && (
                <>
                  <Separator className="my-2" />
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={openAssignVendorDialog}
                  >
                    <span className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Assign Vendor
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}

              {/* Status Transitions */}
              {availableTransitions.length > 0 && (
                <>
                  <Separator className="my-2" />
                  <p className="text-xs text-muted-foreground font-medium mb-1">
                    {isCustomer ? 'Your decision:' : 'Move to:'}
                  </p>
                  {availableTransitions.map(nextStatus => {
                    const nextConfig = ORDER_STATUS_CONFIG[nextStatus]
                    const isDestructive = nextStatus === 'cancelled' || nextStatus === 'rejected'
                    const label = isCustomer
                      ? (['accepted', 'submitted'].includes(nextStatus) ? 'Approve' : ['rejected', 'cancelled'].includes(nextStatus) ? 'Disapprove' : nextConfig?.label || snakeToTitle(nextStatus))
                      : isVendor
                        ? getVendorTransitionLabel(nextStatus)
                      : (nextConfig?.label || snakeToTitle(nextStatus))
                    return (
                      <Button
                        key={nextStatus}
                        variant={isDestructive ? 'destructive' : 'outline'}
                        className="w-full justify-between"
                        disabled={isTransitioning}
                        onClick={() => setTransitionTarget(nextStatus)}
                      >
                        {label}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )
                  })}
                </>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timeline.map((event, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      {i < timeline.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium">{event.status}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(event.date)}</p>
                    </div>
                  </div>
                ))}
                {/* Current status if not in timeline */}
                {!timeline.find(t => t.status.toLowerCase() === order.status) && (
                  <div className="flex gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{statusConfig?.label || order.status}</p>
                      <p className="text-xs text-muted-foreground">Current status</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Pricing Dialog */}
      <Dialog open={pricingDialogOpen} onOpenChange={setPricingDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set Item Pricing</DialogTitle>
            <DialogDescription>
              {isCpoOrder
                ? 'Set the CPO sell price for each device. Use "Suggest" to pull a market-based CPO price, or enter manually.'
                : 'Set the unit price for each item. Use "Suggest Price" to get market-based recommendations, or enter manually.'}
            </DialogDescription>
          </DialogHeader>
          {!isCpoOrder && (
            <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Pricing strategy</p>
                <p className="text-xs text-muted-foreground">Choose how aggressive to price vs competitors</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={String(beatCompetitorPercent)} onValueChange={v => setBeatCompetitorPercent(Number(v))}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Standard" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Standard (margin-based)</SelectItem>
                    <SelectItem value="2">Beat competitors by 2%</SelectItem>
                    <SelectItem value="5">Beat competitors by 5%</SelectItem>
                    <SelectItem value="8">Beat competitors by 8%</SelectItem>
                    <SelectItem value="10">Beat competitors by 10%</SelectItem>
                    <SelectItem value="15">Beat competitors by 15%</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleRepriceMismatchedItems}
                  disabled={isRepricingMismatches}
                >
                  {isRepricingMismatches ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  <span className="ml-1">Reprice Mismatches</span>
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-6 py-4">
            {order?.items?.map(item => {
              const ctxKey = `${item.device_id}_${getStorageForItem(item)}`
              const ctx = marketContext[ctxKey]
              const itemCondition = mapOrderConditionToCompetitorCondition(item.claimed_condition || 'good')
              const conditionSnapshot = ctx?.conditions.find(c => c.condition === itemCondition)
                ?? (() => {
                    // Fallback when exact condition has no data: use closest available (excellent→good, good→excellent/fair, etc.)
                    const qualityOrder: Array<'excellent' | 'good' | 'fair' | 'broken'> = ['excellent', 'good', 'fair', 'broken']
                    const idx = qualityOrder.indexOf(itemCondition as 'excellent' | 'good' | 'fair' | 'broken')
                    if (idx < 0 || !ctx?.conditions?.length) return undefined
                    const preferNext = ctx.conditions.find(c => qualityOrder.indexOf(c.condition as 'excellent' | 'good' | 'fair' | 'broken') === idx + 1) // one step worse
                    const preferPrev = ctx.conditions.find(c => qualityOrder.indexOf(c.condition as 'excellent' | 'good' | 'fair' | 'broken') === idx - 1) // one step better
                    return preferNext ?? preferPrev ?? ctx.conditions[0]
                  })()
              return (
                <div key={item.id} className={`rounded-lg border p-4 space-y-3 ${highlightedPricingItemIds.includes(item.id) ? 'border-primary bg-primary/5' : ''}`}>
                  {/* Item header + price input + total */}
                  <div className="grid grid-cols-[1fr_auto_auto_140px] gap-4 items-end">
                    <div>
                      <Label className="text-sm font-medium">
                        {item.device ? `${item.device.make} ${item.device.model}` : 'Unknown Device'}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity} | {item.claimed_condition ? (CONDITION_CONFIG[item.claimed_condition]?.label || item.claimed_condition) : '—'}
                        {getStorageForItem(item) !== '128GB' && ` | ${getStorageForItem(item)}`}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`price-${item.id}`} className="text-xs text-muted-foreground">
                        Unit Price
                      </Label>
                      <Input
                        id={`price-${item.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={itemPrices[item.id] || ''}
                        onChange={(e) => setItemPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Total</Label>
                      <p className="text-sm font-medium font-mono min-h-[2.25rem] flex items-center">
                        {(() => {
                          const raw = itemPrices[item.id] || ''
                          const num = parseFloat(String(raw).replace(/[^0-9.-]/g, ''))
                          const unit = Number.isFinite(num) ? num : (item.unit_price ?? 0)
                          const total = unit * (item.quantity ?? 1)
                          return total > 0 ? formatCurrency(total) : '—'
                        })()}
                      </p>
                    </div>
                    {!isCpoOrder && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!item.device_id || !!suggestingItemId}
                        onClick={() => handleSuggestPrice(item)}
                      >
                        {suggestingItemId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        <span className="ml-1">{suggestingItemId === item.id ? '...' : 'Suggest'}</span>
                      </Button>
                    )}
                    {isCpoOrder && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!item.device_id || !!suggestingItemId}
                        onClick={() => handleSuggestCpoPrice(item)}
                      >
                        {suggestingItemId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        <span className="ml-1">{suggestingItemId === item.id ? '...' : 'Suggest CPO'}</span>
                      </Button>
                    )}
                  </div>

                  {!!conditionSnapshot && (
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Market reference</span>
                          <span className="mx-1">•</span>
                          <span className="capitalize">{conditionSnapshot.condition}</span>
                          {conditionSnapshot.condition !== itemCondition && (
                            <span className="ml-1 text-muted-foreground/80">(nearest for {itemCondition})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span>
                            Trade-In Avg:{' '}
                            <span className="font-mono font-medium text-blue-600">
                              {conditionSnapshot.avg_trade > 0 ? formatCurrency(conditionSnapshot.avg_trade) : '—'}
                            </span>
                          </span>
                          <span>
                            CPO Avg:{' '}
                            <span className="font-mono font-medium text-green-600">
                              {conditionSnapshot.avg_cpo > 0 ? formatCurrency(conditionSnapshot.avg_cpo) : '—'}
                            </span>
                          </span>
                        </div>
                      </div>
                      {!isCpoOrder && conditionSnapshot.avg_trade > 0 && (
                        <div className="mt-2 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setItemPrices(prev => ({ ...prev, [item.id]: conditionSnapshot.avg_trade.toFixed(2) }))}
                          >
                            Use Market Trade-In Avg
                          </Button>
                        </div>
                      )}
                      {isCpoOrder && conditionSnapshot.avg_cpo > 0 && (
                        <div className="mt-2 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-green-700 hover:text-green-800"
                            onClick={() => setItemPrices(prev => ({ ...prev, [item.id]: conditionSnapshot.avg_cpo.toFixed(2) }))}
                          >
                            Use Market CPO Avg
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Market context — competitor prices for all conditions */}
                  {ctx && !ctx.loading && ctx.conditions.length > 0 && (
                    <div className="mt-2 rounded-md bg-muted/40 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Competitor Market Prices — {getStorageForItem(item)}</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs py-1">Condition</TableHead>
                            <TableHead className="text-xs py-1 text-right">Avg Trade-In</TableHead>
                            <TableHead className="text-xs py-1 text-right">Avg CPO/Sell</TableHead>
                            <TableHead className="text-xs py-1 text-right">Sources</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ctx.conditions.map(c => (
                            <TableRow key={c.condition} className={c.condition === itemCondition ? 'bg-primary/5 font-medium' : ''}>
                              <TableCell className="text-xs py-1 capitalize">
                                {c.condition === itemCondition ? `→ ${c.condition}` : c.condition}
                              </TableCell>
                              <TableCell className="text-xs py-1 text-right font-mono">
                                {c.avg_trade > 0 ? formatCurrency(c.avg_trade) : '—'}
                              </TableCell>
                              <TableCell className="text-xs py-1 text-right font-mono">
                                {c.avg_cpo > 0 ? formatCurrency(c.avg_cpo) : '—'}
                              </TableCell>
                              <TableCell className="text-xs py-1 text-right text-muted-foreground">
                                {Array.from(new Set(c.competitors.map((comp: { name: string }) => comp.name))).join(', ')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {ctx?.loading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading market data...
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPricingDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePrices} disabled={isSavingPrices}>
              {isSavingPrices ? 'Saving...' : 'Save Prices'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Transition Confirmation */}
      <AlertDialog open={!!transitionTarget} onOpenChange={(open) => { if (!open) { setTransitionTarget(null); setTransitionNotes('') } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isCustomer
                ? (transitionTarget === 'accepted' || transitionTarget === 'submitted' ? 'Approve' : transitionTarget === 'rejected' || transitionTarget === 'cancelled' ? 'Disapprove' : 'Confirm')
                : isVendor
                  ? `${transitionTarget ? getVendorTransitionLabel(transitionTarget) : 'Confirm'}?`
                  : `Move to: ${transitionTarget ? (ORDER_STATUS_CONFIG[transitionTarget]?.label || transitionTarget) : ''}?`}
              {isCustomer ? ' this order?' : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isVendor
                ? 'This will update your fulfillment progress for the assigned order. You can optionally add a note.'
                : 'This will update the order status. You can optionally add a note.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="Add a note (optional)..."
              value={transitionNotes}
              onChange={(e) => setTransitionNotes(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                transitionTarget === 'cancelled' || transitionTarget === 'rejected'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
              disabled={isTransitioning}
              onClick={() => transitionTarget && handleTransition(transitionTarget)}
            >
              {isTransitioning ? 'Updating...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Vendor Dialog */}
      <Dialog open={assignVendorDialogOpen} onOpenChange={setAssignVendorDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Vendor</DialogTitle>
            <DialogDescription>
              Select a vendor to assign to order {order.order_number}. The vendor will be notified and can submit bids.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="assign-vendor-select">Vendor</Label>
              {vendorsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading vendors...
                </div>
              ) : (
                <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                  <SelectTrigger id="assign-vendor-select">
                    <SelectValue placeholder="Select a vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorsList.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignVendorDialogOpen(false)} disabled={isAssigningVendor}>
              Cancel
            </Button>
            <Button onClick={handleAssignVendor} disabled={isAssigningVendor || !selectedVendorId}>
              {isAssigningVendor ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
              Assign Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Accept Bid Confirmation Dialog */}
      <Dialog open={acceptBidDialogOpen} onOpenChange={(open) => { if (!open) { setAcceptBidDialogOpen(false); setSelectedBid(null) } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accept Vendor Bid</DialogTitle>
            <DialogDescription>
              Accept this bid and apply markup to calculate customer pricing.
            </DialogDescription>
          </DialogHeader>
          {selectedBid && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-sm font-medium">{selectedBid.vendor?.company_name || 'Unknown Vendor'}</p>
                <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <span>Vendor Unit Price: {formatCurrency(selectedBid.unit_price)}</span>
                  <span>Quantity: {selectedBid.quantity}</span>
                  <span>Lead Time: {selectedBid.lead_time_days} days</span>
                  <span>Vendor Total: {formatCurrency(selectedBid.total_price)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bid-markup">CPO Markup (%)</Label>
                <Input
                  id="bid-markup"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={bidMarkupPercent}
                  onChange={(e) => setBidMarkupPercent(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Customer price per unit:{' '}
                  <span className="font-medium text-foreground font-mono">
                    {formatCurrency(selectedBid.unit_price * (1 + (parseFloat(bidMarkupPercent) || 0) / 100))}
                  </span>
                  {' '}({bidMarkupPercent}% markup)
                </p>
                <p className="text-xs text-muted-foreground">
                  Customer total:{' '}
                  <span className="font-medium text-foreground font-mono">
                    {formatCurrency(
                      selectedBid.unit_price * (1 + (parseFloat(bidMarkupPercent) || 0) / 100) * selectedBid.quantity
                    )}
                  </span>
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAcceptBidDialogOpen(false); setSelectedBid(null) }} disabled={isBidActionLoading}>
              Cancel
            </Button>
            <Button onClick={handleAcceptBid} disabled={isBidActionLoading} className="bg-green-600 hover:bg-green-500 text-white">
              {isBidActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ThumbsUp className="h-4 w-4 mr-1" />}
              Accept Bid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Bid Confirmation Dialog */}
      <AlertDialog open={rejectBidDialogOpen} onOpenChange={(open) => { if (!open) { setRejectBidDialogOpen(false); setSelectedBid(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Vendor Bid?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedBid && (
                <>
                  Reject the bid from <span className="font-medium">{selectedBid.vendor?.company_name || 'this vendor'}</span> for{' '}
                  {selectedBid.quantity} units at {formatCurrency(selectedBid.unit_price)}/unit. This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBidActionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isBidActionLoading}
              onClick={handleRejectBid}
            >
              {isBidActionLoading ? 'Rejecting...' : 'Reject Bid'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
