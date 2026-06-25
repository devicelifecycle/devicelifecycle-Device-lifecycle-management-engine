// ============================================================================
// ORDER DETAIL PAGE
// ============================================================================

'use client'

import { useState, Fragment, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, CheckCircle2, AlertTriangle, ChevronRight, ChevronDown, ChevronUp, DollarSign, Send, FileDown, Sparkles, Loader2, GitBranch, ExternalLink, Truck, Package, Shield, RotateCcw, Pencil, Check, Plus, TrendingDown, UserPlus, ThumbsUp, ThumbsDown, X } from 'lucide-react'
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
import { DiscrepancyDetail } from '@/components/orders/DiscrepancyDetail'
import { getDefaultAppPathForRole } from '@/lib/auth-routing'
import { formatCurrency, formatDateTime, snakeToTitle } from '@/lib/utils'
import { ORDER_STATUS_CONFIG, CUSTOMER_STATUS_CONFIG, VALID_ORDER_TRANSITIONS, CONDITION_CONFIG, STORAGE_OPTIONS } from '@/lib/constants'
import type { OrderStatus, OrderItem, PricingMetadata, AuditLog, VendorBid, Vendor, TriageResult } from '@/types'
import type { Order } from '@/types'

const COE_ADDRESS = {
  name: 'COE Warehouse',
  street1: '123 COE Dr',
  city: 'Toronto',
  state: 'ON',
  postal_code: 'M5V 3A8',
  country: 'CA',
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
      country: (shipping.country as string) || 'CA',
      phone: customer.contact_phone as string | undefined,
      email: customer.contact_email as string | undefined,
    }
  }
  if (order.type === 'cpo' && order.customer) {
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
      country: (shipping.country as string) || 'CA',
      phone: customer.contact_phone as string | undefined,
      email: customer.contact_email as string | undefined,
    }
  }
  return { name: 'Unknown', street1: 'Unknown', city: 'Unknown', state: 'Unknown', postal_code: '00000', country: 'CA' }
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

export default function OrderDetailClient() {
  const params = useParams()
  const { user } = useAuth()
  const isCustomer = user?.role === 'customer'
  const isVendor = user?.role === 'vendor'
  const canSetPricingByRole = user?.role === 'admin' || user?.role === 'coe_manager' || user?.role === 'sales'
  const canEditItems = ['admin', 'coe_manager', 'coe_tech', 'sales'].includes(user?.role ?? '')
  const { order, isLoading, transition, isTransitioning, refetch } = useOrder(params.id as string)
  const isCpoOrder = order?.type === 'cpo'
  const canSetPricing = isCpoOrder ? user?.role === 'admin' : canSetPricingByRole
  const canSendQuote = !isCustomer && !isVendor && ['admin', 'coe_manager', 'sales'].includes(user?.role ?? '')
  const { shipments: orderShipments, refetch: refetchShipments } = useOrderShipments(params.id as string)
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false)
  const [pricingDialogNotes, setPricingDialogNotes] = useState('')
  const [pricingItemEdits, setPricingItemEdits] = useState<Record<string, { storage?: string; condition?: string; quantity?: number; device_id?: string; deviceLabel?: string }>>({})
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({})
  const [itemMetadata, setItemMetadata] = useState<Record<string, PricingMetadata>>({})
  const [expandedPricingContext, setExpandedPricingContext] = useState<string | null>(null)
  const [isSavingPrices, setIsSavingPrices] = useState(false)
  const [isRepricingMismatches, setIsRepricingMismatches] = useState(false)
  const [isSendingMismatchNotice, setIsSendingMismatchNotice] = useState(false)
  const [isSendingQuote, setIsSendingQuote] = useState(false)
  const [isSendingQuoteDirect, setIsSendingQuoteDirect] = useState(false)
  const [isNotifyingPriceChange, setIsNotifyingPriceChange] = useState(false)
  const [isGeneratingPostTriageQuote, setIsGeneratingPostTriageQuote] = useState(false)
  const [suggestingItemId, setSuggestingItemId] = useState<string | null>(null)
  const [isSuggestingAll, setIsSuggestingAll] = useState(false)
  const [transitionTarget, setTransitionTarget] = useState<OrderStatus | null>(null)
  const [transitionNotes, setTransitionNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
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
    retrieved_at?: string
    conditions: { condition: string; avg_trade: number; avg_cpo: number; competitors: { name: string; trade: number | null; sell: number | null }[] }[]
  }>>({})
  // Price suggests for Line Items table (per item)
  const [lineItemSuggestions, setLineItemSuggestions] = useState<Record<string, number>>({})
  const [lineItemSuggestionsLoading, setLineItemSuggestionsLoading] = useState(false)
  // Last manual prices keyed by "deviceId|storage|condition"
  const [lastManualPrices, setLastManualPrices] = useState<Record<string, { price: number; set_at: string }>>({})


  // Inline edit mode for Line Items
  const [isInlineEditing, setIsInlineEditing] = useState(false)
  const [inlineEditPrices, setInlineEditPrices] = useState<Record<string, string>>({})
  // Item property editing (device, qty, storage, condition)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemFields, setEditItemFields] = useState<{ quantity: string; storage: string; condition: string; notes: string }>({ quantity: '1', storage: '', condition: 'good', notes: '' })
  const [isSavingItem, setIsSavingItem] = useState(false)
  const [isDeletingItemId, setIsDeletingItemId] = useState<string | null>(null)
  // Add item in pricing dialog
  const [pricingAddOpen, setPricingAddOpen] = useState(false)
  const [pricingAddForm, setPricingAddForm] = useState({ search: '', device_id: '', deviceLabel: '', storage: '', condition: 'good', quantity: '1' })
  const [pricingSearchResults, setPricingSearchResults] = useState<Array<{ id: string; make: string; model: string }>>([])
  const [isSearchingPricingDevice, setIsSearchingPricingDevice] = useState(false)
  const [isAddingPricingItem, setIsAddingPricingItem] = useState(false)
  // Per-item device replacement search in pricing dialog
  const [deviceEditItemId, setDeviceEditItemId] = useState<string | null>(null)
  const [deviceEditSearch, setDeviceEditSearch] = useState('')
  const [deviceEditResults, setDeviceEditResults] = useState<Array<{ id: string; make: string; model: string }>>([])
  const [isDeviceEditSearching, setIsDeviceEditSearching] = useState(false)
  // Create Shipment dialog
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false)
  const [isCreatingShipment, setIsCreatingShipment] = useState(false)
  const [shipmentDirection, setShipmentDirection] = useState<'inbound' | 'outbound'>('inbound')
  const [shipmentCarrier, setShipmentCarrier] = useState('FedEx')
  const [shipmentCustomCarrier, setShipmentCustomCarrier] = useState('')
  const [shipmentTrackingNumber, setShipmentTrackingNumber] = useState('')
  const [shipmentNotes, setShipmentNotes] = useState('')

  // Customer ship-to-us form
  const [customerShipCarrier, setCustomerShipCarrier] = useState('FedEx')
  const [customerShipTracking, setCustomerShipTracking] = useState('')
  const [customerShipNotes, setCustomerShipNotes] = useState('')
  const [isCustomerShipping, setIsCustomerShipping] = useState(false)

  // Inline order label (internal_notes used as a short customer identifier beside PO number)
  const [labelEditing, setLabelEditing] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [labelSaving, setLabelSaving] = useState(false)

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
  const [bidMarkupPercent, setBidMarkupPercent] = useState('18')
  const [isBidActionLoading, setIsBidActionLoading] = useState(false)

  // Customer exception approval
  const [pendingExceptions, setPendingExceptions] = useState<TriageResult[]>([])
  const [exceptionsLoading, setExceptionsLoading] = useState(false)
  const [exceptionProcessingId, setExceptionProcessingId] = useState<string | null>(null)

  const fetchMarketContext = async (items: OrderItem[]) => {
    const normalizeStorageToken = (value: unknown): string =>
      String(value ?? '')
        .toUpperCase()
        .replace(/\s+/g, '')

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
          // Filter by storage with normalization so "128 GB" and "128GB" are treated the same.
          const requestedStorage = normalizeStorageToken(storage)
          const storageMatchedRows = allRows.filter((r: Record<string, unknown>) => {
            if (!r.storage) return true
            return normalizeStorageToken(r.storage) === requestedStorage
          })
          // Fall back to all rows only when no storage-specific rows exist,
          // so the UI always shows competitor prices rather than a blank table.
          // The avg_trade formula below still uses the correct Bell/Telus/GoRecell blend.
          const rows = storageMatchedRows.length > 0 ? storageMatchedRows : allRows
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
            const sells = competitors.filter(c => c.sell != null).map(c => c.sell!)
            // Mirror the server-side formula: (avg(Bell,Telus) + GoRecell) / 2
            const bellTelusAvg = (() => {
              const bt = competitors.filter(c => (c.name === 'Bell' || c.name === 'Telus') && c.trade != null)
              return bt.length ? bt.reduce((s, c) => s + c.trade!, 0) / bt.length : 0
            })()
            const goRecellTrade = competitors.find(c => c.name === 'GoRecell' && c.trade != null)?.trade ?? 0
            let avg_trade = 0
            if (bellTelusAvg > 0 && goRecellTrade > 0) {
              avg_trade = (bellTelusAvg + goRecellTrade) / 2
            } else if (goRecellTrade > 0) {
              avg_trade = goRecellTrade
            } else if (bellTelusAvg > 0) {
              avg_trade = bellTelusAvg
            } else {
              const trades = competitors.filter(c => c.trade != null).map(c => c.trade!)
              avg_trade = trades.length ? trades.reduce((a, b) => a + b, 0) / trades.length : 0
            }
            return {
              condition,
              avg_trade,
              avg_cpo: sells.length ? sells.reduce((a, b) => a + b, 0) / sells.length : 0,
              competitors,
            }
          }).sort((left, right) => competitorConditionOrder(left.condition) - competitorConditionOrder(right.condition))
          const retrieved_at = data.retrieved_at || allRows[0]?.scraped_at || allRows[0]?.updated_at || undefined
          setMarketContext(prev => ({ ...prev, [key]: { loading: false, conditions, retrieved_at } }))
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
      if (newStatus === 'payment_sent' && (paymentMethod || paymentReference || paymentNotes)) {
        await fetch(`/api/orders/${order?.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_method: paymentMethod || undefined,
            payment_reference: paymentReference || undefined,
            payment_notes: paymentNotes || undefined,
            payment_processed_at: new Date().toISOString(),
          }),
        })
      }
      await transition({ status: newStatus, notes: transitionNotes || undefined })
      toast.success(`Order moved to ${ORDER_STATUS_CONFIG[newStatus]?.label}`)
      setTransitionTarget(null)
      setTransitionNotes('')
      setPaymentMethod('')
      setPaymentReference('')
      setPaymentNotes('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update order status')
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
    // Always prefer the value that was actually uploaded/stored on the item
    if (item.storage) return item.storage
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

  // Fetch last manual prices for all devices in this order
  useEffect(() => {
    if (!order?.items?.length || isCustomer || isVendor) return
    const deviceIds = [...new Set(
      order.items.map((i: OrderItem) => i.device_id).filter(Boolean)
    )]
    if (!deviceIds.length) return
    fetch(`/api/pricing/manual-prices?device_ids=${deviceIds.join(',')}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data) return
        const map: Record<string, { price: number; set_at: string }> = {}
        for (const row of json.data) {
          map[`${row.device_id}|${row.storage}|${row.condition}`] = {
            price: row.last_manual_price,
            set_at: row.last_set_at,
          }
        }
        setLastManualPrices(map)
      })
      .catch(() => {/* ignore */})
  }, [order?.items, isCustomer, isVendor])


  // Sync editable depreciation rate when schedule or order loads
  useEffect(() => {
    if (depreciationSchedule) {
      setEditableDepreciationRate(prev => prev === '' ? String(depreciationSchedule.rate) : prev)
    } else if (order?.depreciation_rate_override != null) {
      setEditableDepreciationRate(String(order.depreciation_rate_override))
    }
  }, [depreciationSchedule, order?.depreciation_rate_override])

  // Auto-fetch competitor market context for internal users when order loads
  useEffect(() => {
    if (!isCustomer && !isVendor && order?.items?.length) {
      fetchMarketContext(order.items)
    }
  // fetchMarketContext is not stable across renders; re-run only when order changes
  }, [order?.id, isCustomer, isVendor])

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
    setBeatCompetitorPercent(0)
    setPricingDialogNotes(order?.notes || '')
    // Pre-populate storage for items that have no stored value so saves always write it to DB
    const initialEdits: Record<string, { storage?: string; condition?: string }> = {}
    order?.items?.forEach(item => {
      if (!item.storage) {
        const derived = getStorageForItem(item)
        if (derived) initialEdits[item.id] = { storage: derived }
      }
    })
    setPricingItemEdits(initialEdits)
    setPricingAddOpen(false)
    setPricingAddForm({ search: '', device_id: '', deviceLabel: '', storage: '', condition: 'good', quantity: '1' })
    setPricingSearchResults([])
    setPricingDialogOpen(true)
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

  const suggestPriceForItem = async (
    item: OrderItem,
    mode: 'trade' | 'cpo',
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    // Prefer the in-progress edited device_id (set when the user picks a
    // different device via the pencil/search icon in the pricing dialog) —
    // item.device_id is only the originally-persisted value and goes stale
    // the moment the device is changed but not yet saved.
    const effectiveDeviceId = pricingItemEdits[item.id]?.device_id ?? item.device_id
    if (!effectiveDeviceId) {
      if (!options?.silent) toast.error('Device not found for this item')
      return false
    }

    setSuggestingItemId(item.id)
    try {
      const isTrade = mode === 'trade'
      const res = await fetch('/api/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 'v2',
          device_id: effectiveDeviceId,
          storage: getStorageForItem(item),
          carrier: 'Unlocked',
          condition: item.claimed_condition || 'good',
          risk_mode: getRiskMode(),
          quantity: isTrade ? (item.quantity || 1) : 1,
          ...(isTrade ? { beat_competitor_percent: beatCompetitorPercent } : {}),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Failed to calculate ${isTrade ? 'price' : 'CPO price'}`)
      }

      const result = await res.json()
      if (!result.success) {
        if (!options?.silent) toast.error(result.error || `Could not calculate ${isTrade ? 'price' : 'CPO price'}`)
        return false
      }

      if (isTrade && result.trade_price != null) {
        // API returns total (trade_price * quantity); dialog input stores unit price.
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
        if (!options?.silent) {
          toast.success(`Suggested ${formatCurrency(unitPrice)} (${result.channel_decision?.margin_tier || '—'} margin)`)
        }
        return true
      }

      const cpoUnit = result.cpo_price ?? result.trade_price
      if (!isTrade && cpoUnit != null && cpoUnit > 0) {
        setItemPrices(prev => ({ ...prev, [item.id]: cpoUnit.toFixed(2) }))
        // Intentionally NOT setting suggested_by_calc:true — CPO API blocks it.
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
        if (!options?.silent) toast.success(`CPO suggested price: ${formatCurrency(cpoUnit)}`)
        return true
      }

      if (!options?.silent) toast.error(result.error || `Could not calculate ${isTrade ? 'price' : 'CPO price'}`)
      return false
    } catch (e) {
      if (!options?.silent) toast.error(e instanceof Error ? e.message : `Failed to suggest ${mode === 'trade' ? 'price' : 'CPO price'}`)
      return false
    } finally {
      setSuggestingItemId(null)
    }
  }

  const handleEditItem = (item: OrderItem) => {
    setEditingItemId(item.id)
    setEditItemFields({
      quantity: String(item.quantity || 1),
      storage: item.storage || '',
      condition: item.claimed_condition || item.actual_condition || 'good',
      notes: item.notes || '',
    })
  }

  const handleSaveItem = async () => {
    if (!editingItemId || !order?.id) return
    setIsSavingItem(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/items/${editingItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: parseInt(editItemFields.quantity, 10) || 1,
          storage: editItemFields.storage || undefined,
          condition: editItemFields.condition,
          notes: editItemFields.notes || undefined,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save') }
      toast.success('Item updated')
      setEditingItemId(null)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save item')
    } finally {
      setIsSavingItem(false)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!order?.id) return
    setIsDeletingItemId(itemId)
    try {
      const res = await fetch(`/api/orders/${order.id}/items/${itemId}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete') }
      toast.success('Item removed')
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete item')
    } finally {
      setIsDeletingItemId(null)
    }
  }

  const handleDeviceEditSearch = async (search: string) => {
    if (!search.trim()) { setDeviceEditResults([]); return }
    setIsDeviceEditSearching(true)
    try {
      const res = await fetch(`/api/devices?search=${encodeURIComponent(search)}&limit=10`)
      if (!res.ok) return
      const data = await res.json()
      setDeviceEditResults(data.data || [])
    } catch { /* ignore */ } finally {
      setIsDeviceEditSearching(false)
    }
  }

  const handleSearchPricingDevice = async (search: string) => {
    if (!search.trim()) { setPricingSearchResults([]); return }
    setIsSearchingPricingDevice(true)
    try {
      const res = await fetch(`/api/devices?search=${encodeURIComponent(search)}&limit=10`)
      if (!res.ok) return
      const data = await res.json()
      setPricingSearchResults((data.data || []).slice(0, 10))
    } catch { /* ignore */ } finally {
      setIsSearchingPricingDevice(false)
    }
  }

  const handleAddPricingItem = async () => {
    if (!order?.id) return
    setIsAddingPricingItem(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: pricingAddForm.device_id || undefined,
          quantity: parseInt(pricingAddForm.quantity, 10) || 1,
          storage: pricingAddForm.storage || undefined,
          condition: pricingAddForm.condition,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to add item') }
      toast.success('Item added')
      setPricingAddOpen(false)
      setPricingAddForm({ search: '', device_id: '', deviceLabel: '', storage: '', condition: 'good', quantity: '1' })
      setPricingSearchResults([])
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add item')
    } finally {
      setIsAddingPricingItem(false)
    }
  }

  const handleSaveLabel = async () => {
    if (!order?.id) return
    setLabelSaving(true)
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internal_notes: labelDraft.trim() }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save') }
      setLabelEditing(false)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save label')
    } finally {
      setLabelSaving(false)
    }
  }

  const handleSuggestPrice = async (item: OrderItem) => {
    await suggestPriceForItem(item, 'trade')
  }

  const handleSuggestCpoPrice = async (item: OrderItem) => {
    await suggestPriceForItem(item, 'cpo')
  }

  const handleSuggestAllPrices = async () => {
    if (!order?.items?.length) return

    const eligibleItems = order.items.filter(item => item.device_id)
    if (eligibleItems.length === 0) {
      toast.error('No devices found to suggest pricing')
      return
    }

    setIsSuggestingAll(true)
    let successCount = 0

    try {
      const mode: 'trade' | 'cpo' = isCpoOrder ? 'cpo' : 'trade'
      for (const item of eligibleItems) {
        const ok = await suggestPriceForItem(item, mode, { silent: true })
        if (ok) successCount += 1
      }

      if (successCount === eligibleItems.length) {
        toast.success(`Suggested pricing for all ${successCount} device(s)`)
      } else if (successCount > 0) {
        toast.warning(`Suggested pricing for ${successCount}/${eligibleItems.length} device(s). Review remaining items manually.`)
      } else {
        toast.error('Could not suggest pricing for the selected devices')
      }
    } finally {
      setIsSuggestingAll(false)
    }
  }

  // Instantly stamps pre-fetched consensus prices into all items (no API call)
  const handleApplyAllSuggested = () => {
    const updates: Record<string, string> = {}
    let count = 0
    order?.items?.forEach(item => {
      const price = lineItemSuggestions[item.id]
      if (price != null && price > 0) {
        updates[item.id] = price.toFixed(2)
        count++
      }
    })
    if (count === 0) {
      toast.error('No consensus prices available — try Suggest All first')
      return
    }
    setItemPrices(prev => ({ ...prev, ...updates }))
    toast.success(`Applied consensus price to ${count} item(s)`)
  }

  // Apply consensus prices to a specific group of item IDs
  const handleApplyGroupSuggested = (itemIds: string[]) => {
    const updates: Record<string, string> = {}
    let count = 0
    itemIds.forEach(id => {
      const price = lineItemSuggestions[id]
      if (price != null && price > 0) {
        updates[id] = price.toFixed(2)
        count++
      }
    })
    if (count === 0) {
      toast.error('No consensus prices available for this group')
      return
    }
    setItemPrices(prev => ({ ...prev, ...updates }))
    toast.success(`Applied consensus price to ${count} item(s) in group`)
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
      // Save any item-level field edits (storage, condition, quantity, device_id) made inside the dialog
      const itemEditEntries = Object.entries(pricingItemEdits).filter(
        ([, e]) => e.storage || e.condition || e.quantity !== undefined || e.device_id
      )
      await Promise.all(itemEditEntries.map(([itemId, edits]) =>
        fetch(`/api/orders/${params.id}/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(edits.storage ? { storage: edits.storage } : {}),
            ...(edits.condition ? { condition: edits.condition } : {}),
            ...(edits.quantity !== undefined ? { quantity: edits.quantity } : {}),
            ...(edits.device_id ? { device_id: edits.device_id } : {}),
          }),
        })
      ))

      // Save order-level notes if changed
      const notesChanged = pricingDialogNotes !== (order?.notes || '')
      if (notesChanged) {
        await fetch(`/api/orders/${params.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_notes: pricingDialogNotes }),
        })
      }

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

  const handleSavePricesAndSendQuote = async () => {
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
    setIsSendingQuote(true)
    try {
      // Save item-level field edits
      const itemEditEntries = Object.entries(pricingItemEdits).filter(
        ([, e]) => e.storage || e.condition || e.quantity !== undefined || e.device_id
      )
      await Promise.all(itemEditEntries.map(([itemId, edits]) =>
        fetch(`/api/orders/${params.id}/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(edits.storage ? { storage: edits.storage } : {}),
            ...(edits.condition ? { condition: edits.condition } : {}),
            ...(edits.quantity !== undefined ? { quantity: edits.quantity } : {}),
            ...(edits.device_id ? { device_id: edits.device_id } : {}),
          }),
        })
      ))

      // Save order-level notes if changed
      const notesChanged = pricingDialogNotes !== (order?.notes || '')
      if (notesChanged) {
        await fetch(`/api/orders/${params.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_notes: pricingDialogNotes }),
        })
      }

      const patchRes = await fetch(`/api/orders/${params.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSend }),
      })
      const patchData = await patchRes.json().catch(() => ({}))
      if (!patchRes.ok) {
        const msg = patchData.error || patchData.details?.[0]?.message || 'Failed to update prices'
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }

      if (order?.status === 'draft') {
        await transition({ status: 'submitted' as OrderStatus, notes: 'Auto-submitted for quoting' })
        await refetch()
      }
      await transition({ status: 'quoted' as OrderStatus, notes: 'Quote sent to customer' })
      toast.success('Prices saved and quote sent to customer')
      setPricingDialogOpen(false)
      refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save and send quote'
      toast.error(message)
    } finally {
      setIsSavingPrices(false)
      setIsSendingQuote(false)
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

  const handleSendQuoteDirect = async () => {
    if (!order) return
    setIsSendingQuoteDirect(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/send-quote-email`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send quote')
      toast.success('Quote with PDF & Excel sent directly to customer')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send quote email')
    } finally {
      setIsSendingQuoteDirect(false)
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

  const handleGeneratePostTriageQuote = async () => {
    if (!order) return
    setIsGeneratingPostTriageQuote(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/generate-quote`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to generate quote')
      toast.success('Post-triage quote generated and sent to customer')
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate quote')
    } finally {
      setIsGeneratingPostTriageQuote(false)
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
    if (!shipmentTrackingNumber.trim()) {
      toast.error('Tracking number is required')
      return
    }
    setIsCreatingShipment(true)
    try {
      const direction = isVendor ? 'inbound' : shipmentDirection
      const isInboundToCoe = direction === 'inbound'
      const payload: Record<string, unknown> = {
        order_id: params.id,
        direction,
        carrier: shipmentCarrier.trim(),
        custom_carrier: shipmentCarrier === 'Other' ? resolvedCarrier : undefined,
        tracking_number: shipmentTrackingNumber.trim(),
        notes: shipmentNotes.trim() || undefined,
        from_address: isInboundToCoe ? buildShipToAddress(order) : COE_ADDRESS,
        to_address: isInboundToCoe ? COE_ADDRESS : buildShipToAddress(order),
      }
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create shipment')
      toast.success(isVendor ? 'Tracking uploaded' : 'Shipment tracking saved')
      setShipmentDialogOpen(false)
      setShipmentCarrier('FedEx')
      setShipmentCustomCarrier('')
      setShipmentTrackingNumber('')
      setShipmentNotes('')
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
    setShipmentCarrier('FedEx')
    setShipmentCustomCarrier('')
    setShipmentTrackingNumber('')
    setShipmentNotes('')
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update device condition')
      }
      toast.success(approved ? 'Device condition approved' : 'Device condition rejected')
      setPendingExceptions(prev => prev.filter(e => e.id !== triageResultId))
      await refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update device condition')
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
          cpo_markup_percent: parseFloat(bidMarkupPercent) || 18,
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
    const fallbackHref = getDefaultAppPathForRole(user?.role)
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-2xl font-bold">Order not found</p>
        <p className="text-muted-foreground">This order doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link href={fallbackHref}>
          <Button variant="outline">Back to Orders</Button>
        </Link>
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
  const showLastManualPrice = !isCustomer && !isVendor && canSetPricing
  const showLineItemPricingSource = !isCustomer && !isVendor && (((order.items ?? []).some((i: OrderItem) => i.pricing_metadata?.pricing_source)) || order.status === 'submitted' || order.status === 'quoted')
  const lineItemColSpan =
    3 +
    (showLineItemPrices ? 2 : 0) +
    (showLineItemSuggestions ? 1 : 0) +
    (showLastManualPrice ? 1 : 0) +
    (showLineItemPricingSource ? 1 : 0)
  const availableTransitions = isCustomer
    ? rawTransitions.filter((s: OrderStatus) => customerAllowedTransitions.includes(s))
    : isVendor
      ? rawTransitions.filter((s: OrderStatus) => vendorAllowedTransitions.includes(s))
    // 'sourcing' is only valid for CPO orders — hide it from trade-in / other types
      : rawTransitions.filter((s: OrderStatus) =>
        (s !== 'sourcing' || isCpoOrder) &&
        !(order.status === 'sourced' && s === 'shipped') &&
        !(s === 'payment_sent' && isCpoOrder)
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
            {!isCustomer && (
              labelEditing ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    type="text"
                    value={labelDraft}
                    onChange={e => setLabelDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveLabel(); if (e.key === 'Escape') setLabelEditing(false) }}
                    onBlur={handleSaveLabel}
                    placeholder="Add label…"
                    maxLength={60}
                    className="h-7 rounded border border-input bg-background px-2 text-sm font-normal w-40"
                  />
                  {labelSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setLabelDraft(order.internal_notes || ''); setLabelEditing(true) }}
                  className="group flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="Add / edit label"
                >
                  {order.internal_notes
                    ? <span className="text-base font-normal">— {order.internal_notes}</span>
                    : <span className="text-sm opacity-0 group-hover:opacity-60 transition-opacity">+ label</span>}
                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                </button>
              )
            )}
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

      {/* Vendor waiting banner — their bid was accepted, waiting for customer to approve the quote */}
      {isVendor && order.status === 'quoted' && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20">
          <CardContent className="py-4 flex items-start gap-3">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">Awaiting customer approval</p>
              <p className="text-sm text-amber-700 dark:text-amber-300/90 mt-0.5">
                Your bid has been selected. The customer is reviewing the quote — you&apos;ll be notified once they approve and the order is ready to fulfill.
              </p>
            </div>
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
                      variant="success"
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

      {/* Vendor: fulfillment complete — order is in payment or closed state */}
      {isVendor && ['payment_processing', 'payment_sent', 'closed'].includes(order.status) && (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20">
          <CardContent className="py-4 flex items-start gap-3">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">Fulfillment complete</p>
              <p className="text-sm text-green-700 dark:text-green-300/90 mt-0.5">
                {order.status === 'closed'
                  ? 'This order has been fully completed and closed. Thank you for fulfilling this order.'
                  : 'The customer has confirmed delivery. DLM is processing the final payment and will close the order shortly.'}
              </p>
            </div>
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
                {canViewCommercials && (order.quoted_amount ?? 0) > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Quoted Amount</p>
                    <p className="font-medium">{formatCurrency(order.quoted_amount ?? 0)}</p>
                  </div>
                )}
                {canViewCommercials && (order.final_amount ?? 0) > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Final Amount</p>
                    <p className="font-medium text-green-600">{formatCurrency(order.final_amount ?? 0)}</p>
                  </div>
                )}
              </div>

              {/* Post-triage quote generation — for walk-in/unquoted trade-ins */}
              {canSetPricingByRole && order.type === 'trade_in' &&
                ['received', 'in_triage', 'qc_complete'].includes(order.status) &&
                !(order.quoted_amount && order.quoted_amount > 0) && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">No quote sent yet</p>
                    <p className="text-xs text-muted-foreground">
                      This order arrived without a prior quote. Generate a quote based on {order.status === 'qc_complete' ? 'actual triage condition' : 'device condition'} and send it to the customer.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="success"
                    onClick={handleGeneratePostTriageQuote}
                    disabled={isGeneratingPostTriageQuote}
                  >
                    {isGeneratingPostTriageQuote ? 'Generating...' : 'Generate & Send Quote'}
                  </Button>
                </div>
              )}
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
                        <Button size="sm" variant="success" onClick={handleSaveAndSendQuote} disabled={isSavingPrices || isSendingQuote}>
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
                      {showLastManualPrice && (
                        <TableHead className="w-32">Last Manual</TableHead>
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
                              {item.notes && (() => {
                                const displayNote = item.notes.replace(/\[Original qty:\s*\d+\]\s*\|?\s*/gi, '').replace(/^\s*\|\s*/, '').trim()
                                return displayNote ? (
                                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{displayNote}</p>
                                ) : null
                              })()}
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
                            {showLastManualPrice && (() => {
                              const storage = getStorageForItem(item)
                              const cond = item.actual_condition || item.claimed_condition || 'good'
                              const manualKey = `${item.device_id}|${storage}|${cond}`
                              const manualEntry = lastManualPrices[manualKey]
                              return (
                                <TableCell>
                                  {manualEntry ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-mono text-amber-600 dark:text-amber-400">
                                        {formatCurrency(manualEntry.price)}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-1.5 text-xs"
                                        title={`Last set ${new Date(manualEntry.set_at).toLocaleDateString()}`}
                                        onClick={() => {
                                          if (isInlineEditing) {
                                            setInlineEditPrices(prev => ({ ...prev, [item.id]: manualEntry.price.toFixed(2) }))
                                          } else {
                                            handleOpenPricingDialog({ [item.id]: manualEntry.price.toFixed(2) })
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
                              )
                            })()}
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
                            {canEditItems && !isInlineEditing && (
                              <TableCell className="w-[70px]">
                                {editingItemId === item.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={handleSaveItem}
                                      disabled={isSavingItem}
                                      className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                      title="Save changes"
                                    >
                                      {isSavingItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingItemId(null)}
                                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                      title="Cancel"
                                    >
                                      <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      onClick={() => handleEditItem(item)}
                                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                      title="Edit device / qty / condition"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteItem(item.id)}
                                      disabled={isDeletingItemId === item.id}
                                      className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                      title="Remove item"
                                    >
                                      {isDeletingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                          {editingItemId === item.id && (
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={lineItemColSpan + 1} className="py-2 px-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                  <div>
                                    <label className="text-xs text-muted-foreground mb-1 block">Quantity</label>
                                    <input
                                      type="number" min="1"
                                      value={editItemFields.quantity}
                                      onChange={e => setEditItemFields(f => ({ ...f, quantity: e.target.value }))}
                                      className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground mb-1 block">Storage</label>
                                    <input
                                      type="text" placeholder="e.g. 256GB"
                                      value={editItemFields.storage}
                                      onChange={e => setEditItemFields(f => ({ ...f, storage: e.target.value }))}
                                      className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground mb-1 block">Condition</label>
                                    <select
                                      value={editItemFields.condition}
                                      onChange={e => setEditItemFields(f => ({ ...f, condition: e.target.value }))}
                                      className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                                    >
                                      {['new','excellent','good','fair','poor','broken'].map(c => (
                                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                                    <input
                                      type="text"
                                      value={editItemFields.notes}
                                      onChange={e => setEditItemFields(f => ({ ...f, notes: e.target.value }))}
                                      className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                                    />
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
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
                                    variant="success"
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
                                    variant="destructive"
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
                    const receivingMismatchNote = shipment.exception_details || shipment.receiving_notes || ''
                    const hasReceivingMismatch = /quantity mismatch|discrepancy/i.test(receivingMismatchNote)
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
                            {hasReceivingMismatch && (
                              <div className="mt-1 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                                <Badge variant="destructive" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                                  Quantity mismatch
                                </Badge>
                                <span>{receivingMismatchNote}</span>
                              </div>
                            )}
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

          {/* Discrepancies / Exceptions Section */}
          {(['accepted', 'sourcing', 'sourced', 'shipped_to_coe', 'received', 'in_triage', 'qc_complete', 'mismatch_review', 'ready_to_ship'] as const).includes(order.status as any) && (
              <DiscrepancyDetail orderId={order.id} />

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
                {isVendor && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Manual tracking upload</p>
                    <p className="text-xs text-muted-foreground">Enter the tracking number from any carrier or platform.</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="shipment-tracking">Tracking Number</Label>
                  <Input
                    id="shipment-tracking"
                    placeholder="Enter tracking number from any carrier or platform"
                    value={shipmentTrackingNumber}
                    onChange={(e) => setShipmentTrackingNumber(e.target.value)}
                  />
                </div>
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
                    !shipmentTrackingNumber.trim()
                  }
                >
                  {isCreatingShipment ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Truck className="h-4 w-4 mr-1" />}
                  {isVendor ? 'Upload Tracking' : 'Save Tracking'}
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
                className="w-full justify-between overflow-hidden"
                onClick={() => {
                  const isQuote = ['draft', 'submitted', 'quoted'].includes(order.status)
                  window.open(`/api/orders/${order.id}/pdf`, '_blank')
                  toast.success(`${isQuote ? 'Quote' : 'Invoice'} PDF download started`)
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <FileDown className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {['draft', 'submitted', 'quoted'].includes(order.status) ? 'Download Quote (PDF)' : 'Download Invoice (PDF)'}
                  </span>
                </span>
              </Button>

              {/* Download Excel */}
              <Button
                variant="outline"
                className="w-full justify-between overflow-hidden"
                onClick={() => {
                  const isQuote = ['draft', 'submitted', 'quoted'].includes(order.status)
                  window.open(`/api/orders/${order.id}/excel`, '_blank')
                  toast.success(`${isQuote ? 'Quote' : 'Invoice'} Excel download started`)
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <FileDown className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {['draft', 'submitted', 'quoted'].includes(order.status) ? 'Download Quote (Excel)' : 'Download Invoice (Excel)'}
                  </span>
                </span>
              </Button>

              {/* Pricing and Quote Actions — admin and coe_manager only */}
              {canSetPricing && order.status !== 'cancelled' && order.status !== 'closed' && (
                <>
                  <Button
                    variant="outline"
                    className="w-full justify-between overflow-hidden"
                    onClick={() => handleOpenPricingDialog()}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <DollarSign className="h-4 w-4 shrink-0" />
                      <span className="truncate">Set Pricing</span>
                    </span>
                  </Button>
                  {mismatchedItemCount > 0 && (
                    <Button
                      variant="outline"
                      className="w-full justify-between overflow-hidden"
                      onClick={handleSendMismatchNotice}
                      disabled={isSendingMismatchNotice}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {isSendingMismatchNotice ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                        <span className="truncate">Send Mismatch Notice ({mismatchedItemCount})</span>
                      </span>
                    </Button>
                  )}
                </>
              )}

              {/* Send Quote — available to internal staff when order has prices */}
              {canSendQuote && (order.status === 'draft' || order.status === 'submitted') && (
                <Button
                  size="lg"
                  variant="success"
                  className="w-full justify-between text-base font-semibold"
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

              {/* Send Quote Directly — PDF + Excel email to customer */}
              {canSendQuote && ['draft', 'submitted', 'quoted'].includes(order.status) && (
                <Button
                  variant="outline"
                  className="w-full justify-between overflow-hidden"
                  disabled={!hasPricesForQuote || isSendingQuoteDirect}
                  title={!hasPricesForQuote ? 'Set pricing first' : 'Send PDF + Excel directly to customer email'}
                  onClick={handleSendQuoteDirect}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {isSendingQuoteDirect ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Send className="h-4 w-4 shrink-0" />}
                    <span className="truncate">
                      {isSendingQuoteDirect ? 'Sending...' : 'Email Quote to Customer (PDF + Excel)'}
                    </span>
                  </span>
                </Button>
              )}

              {/* Notify Customer of Price Change — internal roles only, quoted orders */}
              {canSendQuote && order.status === 'quoted' && (
                <>
                  <Separator className="my-2" />
                  <Button
                    variant="outline"
                    className="w-full justify-between overflow-hidden"
                    disabled={isNotifyingPriceChange}
                    onClick={handleNotifyPriceChange}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {isNotifyingPriceChange ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      ) : (
                        <Send className="h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">
                        {isNotifyingPriceChange ? 'Sending...' : 'Notify Customer of Price Change'}
                      </span>
                    </span>
                  </Button>
                </>
              )}

              {/* Split Order Button — admin and coe_manager only */}
              {canSetPricing && order.status === 'sourcing' && !order.is_split_order && !order.parent_order_id && (
                <>
                  <Separator className="my-2" />
                  <Link href={`/orders/${order.id}/split`}>
                    <Button variant="outline" className="w-full justify-between overflow-hidden">
                      <span className="flex items-center gap-2 min-w-0">
                        <GitBranch className="h-4 w-4 shrink-0" />
                        <span className="truncate">Split Across Vendors</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0" />
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
                    className="w-full justify-between overflow-hidden"
                    onClick={openAssignVendorDialog}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <UserPlus className="h-4 w-4 shrink-0" />
                      <span className="truncate">Assign Vendor</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" />
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
                    const isSuccess = nextStatus === 'accepted'
                    const label = isCustomer
                      ? (['accepted', 'submitted'].includes(nextStatus) ? 'Approve' : ['rejected', 'cancelled'].includes(nextStatus) ? 'Disapprove' : nextConfig?.label || snakeToTitle(nextStatus))
                      : isVendor
                        ? getVendorTransitionLabel(nextStatus)
                      : nextStatus === 'payment_sent'
                        ? 'Mark Payment Sent'
                      : (nextConfig?.label || snakeToTitle(nextStatus))
                    return (
                      <Button
                        key={nextStatus}
                        variant={isSuccess ? 'success' : 'outline'}
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

          {/* Market Prices — internal users only */}
          {!isCustomer && !isVendor && order?.items && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Market Prices
                </CardTitle>
                <CardDescription>Bell / GoRecell / Telus trade-in</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {Array.from(
                  new Map(
                    order.items
                      .filter(i => i.device_id)
                      .map(i => [`${i.device_id}_${getStorageForItem(i)}`, i])
                  ).entries()
                ).map(([key, item]) => {
                  const ctx = marketContext[key]
                  const condition = mapOrderConditionToCompetitorCondition(item.actual_condition || item.claimed_condition || 'good')
                  const condData = ctx?.conditions.find(c => c.condition === condition)
                  const nearestCondData = condData ?? (() => {
                    const qualityOrder: Array<'excellent' | 'good' | 'fair' | 'broken'> = ['excellent', 'good', 'fair', 'broken']
                    const idx = qualityOrder.indexOf(condition as 'excellent' | 'good' | 'fair' | 'broken')
                    if (idx < 0 || !ctx?.conditions?.length) return undefined
                    const preferNext = ctx.conditions.find(c => qualityOrder.indexOf(c.condition as 'excellent' | 'good' | 'fair' | 'broken') === idx + 1)
                    const preferPrev = ctx.conditions.find(c => qualityOrder.indexOf(c.condition as 'excellent' | 'good' | 'fair' | 'broken') === idx - 1)
                    return preferNext ?? preferPrev ?? ctx.conditions[0]
                  })()
                  const deviceName = item.device ? `${item.device.make} ${item.device.model}` : 'Device'
                  const deviceLabel = `${deviceName} ${getStorageForItem(item)}`
                  return (
                    <div key={key} className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">{deviceLabel}</p>
                      {ctx?.loading ? (
                        <p className="text-xs text-muted-foreground">Loading…</p>
                      ) : nearestCondData ? (
                        <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
                          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                            <span>Competitor prices</span>
                            {nearestCondData.condition !== condition && <span>Nearest match: {nearestCondData.condition}</span>}
                          </div>
                          <div className="space-y-0.5">
                            {nearestCondData.competitors.filter(c => c.trade != null).map(c => (
                              <div key={c.name} className="flex items-center justify-between text-xs gap-2">
                                <span className="text-amber-900/80 dark:text-amber-100/80">{c.name}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-amber-950 dark:text-amber-50">{formatCurrency(c.trade!)}</span>
                                  {isInlineEditing && item && (
                                    <button
                                      type="button"
                                      onClick={() => setInlineEditPrices(prev => ({ ...prev, [item.id]: c.trade!.toFixed(2) }))}
                                      className="rounded px-1 py-0.5 text-[9px] font-bold uppercase bg-amber-700 text-white hover:bg-amber-800 transition-colors"
                                    >
                                      Use
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {ctx?.retrieved_at && (
                            <p className="text-[10px] text-amber-700/70 dark:text-amber-300/60 pt-0.5">
                              Prices as of {new Date(ctx.retrieved_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                          <p className="font-semibold">No competitor data for {condition}</p>
                          <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
                            The quote still calculates, but there are no competitor rows yet for this device/storage.
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!order.items.some(i => i.device_id) && (
                  <p className="text-xs text-muted-foreground">No devices with pricing data</p>
                )}
              </CardContent>
            </Card>
          )}

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
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          {/* Sticky header */}
          <div className="px-6 pt-6 pb-3 border-b flex-none">
            <DialogHeader>
              <DialogTitle>Set Item Pricing</DialogTitle>
              <DialogDescription>
                {isCpoOrder
                  ? 'Set the CPO sell price for each device. Use "Suggest" to pull a market-based CPO price, or enter manually.'
                  : 'Set the unit price for each item. Use "Suggest Price" to get market-based recommendations, or enter manually.'}
              </DialogDescription>
            </DialogHeader>
          </div>
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
          <div className="flex justify-end gap-2">
            {!isCpoOrder && Object.keys(lineItemSuggestions).length > 0 && (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleApplyAllSuggested}
                disabled={isSuggestingAll || !!suggestingItemId}
              >
                <Check className="h-4 w-4" />
                <span className="ml-1">Apply All Consensus ({Object.keys(lineItemSuggestions).length})</span>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSuggestAllPrices}
              disabled={isSuggestingAll || !!suggestingItemId || !(order?.items?.some(item => item.device_id))}
            >
              {isSuggestingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="ml-1">{isSuggestingAll ? 'Suggesting…' : isCpoOrder ? 'Suggest All CPO' : 'Suggest All'}</span>
            </Button>
          </div>
          <div className="space-y-4">
            {(() => {
              // Group items by device+storage+condition for bulk-apply
              type GroupEntry = { key: string; label: string; storage: string; condition: string; items: OrderItem[] }
              const groupMap = new Map<string, GroupEntry>()
              ;(order?.items ?? []).forEach(item => {
                const deviceLabel = pricingItemEdits[item.id]?.deviceLabel ?? (item.device ? `${item.device.make} ${item.device.model}` : 'Unknown Device')
                const storage = pricingItemEdits[item.id]?.storage ?? getStorageForItem(item)
                const condition = pricingItemEdits[item.id]?.condition ?? item.claimed_condition ?? 'good'
                const key = `${deviceLabel}|${storage}|${condition}`
                if (!groupMap.has(key)) groupMap.set(key, { key, label: deviceLabel, storage, condition, items: [] })
                groupMap.get(key)!.items.push(item)
              })
              const groups = Array.from(groupMap.values())
              const showGroups = groups.length < (order?.items?.length ?? 0)
              return <>{groups.map(group => (
                <div key={group.key}>
                  {showGroups && (
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {group.label} · {group.storage} · <span className="capitalize">{group.condition}</span>
                        <span className="ml-1 font-normal">({group.items.length} {group.items.length === 1 ? 'item' : 'items'})</span>
                      </span>
                      {!isCpoOrder && group.items.some(i => lineItemSuggestions[i.id] != null) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => handleApplyGroupSuggested(group.items.map(i => i.id))}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Apply to group
                        </Button>
                      )}
                    </div>
                  )}
                  {group.items.map(item => {
              const effectiveDeviceId = pricingItemEdits[item.id]?.device_id ?? item.device_id
              const ctxKey = `${effectiveDeviceId}_${getStorageForItem(item)}`
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
                <div key={item.id} className={`rounded-lg border p-4 space-y-3 relative ${highlightedPricingItemIds.includes(item.id) ? 'border-primary bg-primary/5' : ''}`}>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    disabled={!!isDeletingItemId}
                    title="Remove item"
                    className="absolute top-2 right-2 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    {isDeletingItemId === item.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <X className="h-3.5 w-3.5" />}
                  </button>
                  {/* Item header + price input + total */}
                  {/* items-start, not items-end: the first column grows an extra
                      row while editing the device (search input above qty/
                      condition/storage), and items-end was anchoring Unit
                      Price/Total/Suggest to the bottom of that now-taller
                      column instead of lining up with its top. */}
                  <div className="grid grid-cols-[1fr_auto_auto_140px] gap-4 items-start">
                    <div className="space-y-1.5">
                      {deviceEditItemId === item.id ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="Search device…"
                              value={deviceEditSearch}
                              onChange={e => { setDeviceEditSearch(e.target.value); handleDeviceEditSearch(e.target.value) }}
                              className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
                              autoFocus
                            />
                            {isDeviceEditSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                            <button
                              type="button"
                              onClick={() => { setDeviceEditItemId(null); setDeviceEditSearch(''); setDeviceEditResults([]) }}
                              className="text-muted-foreground hover:text-foreground p-0.5"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {deviceEditResults.length > 0 && (
                            <div className="rounded border bg-popover shadow text-xs max-h-36 overflow-y-auto z-10 relative">
                              {deviceEditResults.map(d => (
                                <button
                                  key={d.id}
                                  type="button"
                                  className="w-full text-left px-2 py-1.5 hover:bg-accent"
                                  onClick={() => {
                                    const label = `${d.make} ${d.model}`
                                    setPricingItemEdits(prev => ({ ...prev, [item.id]: { ...prev[item.id], device_id: d.id, deviceLabel: label } }))
                                    // Clear any price/metadata/consensus-suggestion computed for the
                                    // OLD device — leaving it in place would silently carry a stale
                                    // number into the new device, looking valid even though it was
                                    // priced against the wrong item. lineItemSuggestions is a SEPARATE
                                    // cache from itemPrices (populated once when the dialog opens, read
                                    // by "Apply All Consensus" / "Apply to group") — clearing only
                                    // itemPrices/itemMetadata still left a trap: changing the device,
                                    // then clicking Apply Consensus, re-stamped the old device's cached
                                    // suggestion straight back into itemPrices.
                                    setItemPrices(prev => { const next = { ...prev }; delete next[item.id]; return next })
                                    setItemMetadata(prev => { const next = { ...prev }; delete next[item.id]; return next })
                                    setLineItemSuggestions(prev => { const next = { ...prev }; delete next[item.id]; return next })
                                    setDeviceEditItemId(null)
                                    setDeviceEditSearch('')
                                    setDeviceEditResults([])
                                  }}
                                >
                                  {d.make} {d.model}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Label className="text-sm font-medium">
                            {pricingItemEdits[item.id]?.deviceLabel ?? (item.device ? `${item.device.make} ${item.device.model}` : 'Unknown Device')}
                          </Label>
                          <button
                            type="button"
                            title="Change device"
                            onClick={() => { setDeviceEditItemId(item.id); setDeviceEditSearch(''); setDeviceEditResults([]) }}
                            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Qty:</span>
                          <input
                            type="number"
                            min="1"
                            value={pricingItemEdits[item.id]?.quantity ?? item.quantity ?? 1}
                            onChange={e => setPricingItemEdits(prev => ({ ...prev, [item.id]: { ...prev[item.id], quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } }))}
                            className="w-14 rounded border border-input bg-background px-1.5 py-0.5 text-xs text-center"
                          />
                        </div>
                        <select
                          value={pricingItemEdits[item.id]?.condition ?? item.claimed_condition ?? 'good'}
                          onChange={e => setPricingItemEdits(prev => ({ ...prev, [item.id]: { ...prev[item.id], condition: e.target.value } }))}
                          className="rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                        >
                          {['new','excellent','good','fair','poor','broken'].map(c => (
                            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Storage"
                          value={pricingItemEdits[item.id]?.storage ?? getStorageForItem(item)}
                          onChange={e => setPricingItemEdits(prev => ({ ...prev, [item.id]: { ...prev[item.id], storage: e.target.value } }))}
                          className="w-20 rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`price-${item.id}`} className="text-xs text-muted-foreground">
                        Unit Price {group.items.length > 1 && <span className="ml-1 text-[10px] text-muted-foreground/70">(applies to all {group.items.length})</span>}
                      </Label>
                      <Input
                        id={`price-${item.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={itemPrices[item.id] || ''}
                        onChange={(e) => {
                          const val = e.target.value
                          setItemPrices(prev => {
                            const updates: Record<string, string> = {}
                            group.items.forEach(gi => { updates[gi.id] = val })
                            return { ...prev, ...updates }
                          })
                        }}
                      />
                      {(() => {
                        const storage = pricingItemEdits[item.id]?.storage ?? getStorageForItem(item)
                        const cond = pricingItemEdits[item.id]?.condition ?? item.claimed_condition ?? 'good'
                        const manualKey = `${pricingItemEdits[item.id]?.device_id ?? item.device_id}|${storage}|${cond}`
                        const manualEntry = lastManualPrices[manualKey]
                        if (!manualEntry) return null
                        return (
                          <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                            <span>Last manual: <strong>{formatCurrency(manualEntry.price)}</strong></span>
                            <span className="text-muted-foreground">({new Date(manualEntry.set_at).toLocaleDateString()})</span>
                            <button
                              type="button"
                              className="underline hover:no-underline"
                              onClick={() => setItemPrices(prev => {
                                const updates: Record<string, string> = {}
                                group.items.forEach(gi => { updates[gi.id] = manualEntry.price.toFixed(2) })
                                return { ...prev, ...updates }
                              })}
                            >Use</button>
                          </div>
                        )
                      })()}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Total</Label>
                      <p className="text-sm font-medium font-mono min-h-[2.25rem] flex items-center">
                        {(() => {
                          const raw = itemPrices[item.id] || ''
                          const num = parseFloat(String(raw).replace(/[^0-9.-]/g, ''))
                          const unit = Number.isFinite(num) ? num : (item.unit_price ?? 0)
                          const qty = pricingItemEdits[item.id]?.quantity ?? item.quantity ?? 1
                          const total = unit * qty
                          return total > 0 ? formatCurrency(total) : '—'
                        })()}
                      </p>
                    </div>
                    {!isCpoOrder && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!item.device_id || !!suggestingItemId || isSuggestingAll}
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
                        disabled={!item.device_id || !!suggestingItemId || isSuggestingAll}
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
                  {ctx && !ctx.loading && ctx.conditions.length === 0 && (
                    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50/90 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                        No competitor data found
                      </p>
                      <p className="mt-1 text-xs text-amber-900/85 dark:text-amber-100/85">
                        No competitor rows are available yet for {getStorageForItem(item)}. The quote is still available, but it is using internal pricing logic rather than market rows.
                      </p>
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
              ))}</>
            })()}
          </div>
          {/* Add item to order from pricing dialog */}
          <div className="border-t pt-3">
            {!pricingAddOpen ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPricingAddOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Device
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Add Device</p>
                  <button
                    type="button"
                    onClick={() => { setPricingAddOpen(false); setPricingSearchResults([]) }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search device (e.g. iPhone 15 Pro)"
                      value={pricingAddForm.search}
                      onChange={e => {
                        const v = e.target.value
                        setPricingAddForm(prev => ({ ...prev, search: v, device_id: '', deviceLabel: '' }))
                        handleSearchPricingDevice(v)
                      }}
                    />
                    {isSearchingPricingDevice && <Loader2 className="h-4 w-4 animate-spin shrink-0 text-muted-foreground" />}
                  </div>
                  {pricingSearchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                      {pricingSearchResults.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          className="w-full px-3 py-2 text-sm text-left hover:bg-accent"
                          onClick={() => {
                            const label = `${d.make} ${d.model}`
                            setPricingAddForm(prev => ({ ...prev, search: label, device_id: d.id, deviceLabel: label }))
                            setPricingSearchResults([])
                          }}
                        >
                          {d.make} {d.model}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Storage</Label>
                    <Input
                      placeholder="128GB"
                      value={pricingAddForm.storage}
                      onChange={e => setPricingAddForm(prev => ({ ...prev, storage: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Condition</Label>
                    <select
                      value={pricingAddForm.condition}
                      onChange={e => setPricingAddForm(prev => ({ ...prev, condition: e.target.value }))}
                      className="w-full rounded border border-input bg-background px-2 py-2 text-sm"
                    >
                      {['excellent', 'good', 'fair', 'poor', 'broken'].map(c => (
                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={pricingAddForm.quantity}
                      onChange={e => setPricingAddForm(prev => ({ ...prev, quantity: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setPricingAddOpen(false); setPricingSearchResults([]) }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isAddingPricingItem}
                    onClick={handleAddPricingItem}
                  >
                    {isAddingPricingItem
                      ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      : <Plus className="h-4 w-4 mr-1" />}
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
          {/* Order notes — visible to customer and included in quote email */}
          <div className="pt-2 border-t space-y-1.5">
            <Label className="text-sm font-medium">Notes for customer</Label>
            <p className="text-xs text-muted-foreground">Included in the quote email sent to the customer.</p>
            <textarea
              rows={3}
              placeholder="Add any notes, special instructions, or comments for the customer…"
              value={pricingDialogNotes}
              onChange={e => setPricingDialogNotes(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          </div>{/* end scrollable body */}

          {/* Sticky footer */}
          <div className="flex-none border-t px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-background">
            <div className="text-xs text-muted-foreground">
              {(() => {
                const total = (order?.items ?? []).reduce((sum, item) => {
                  const raw = itemPrices[item.id] || ''
                  const num = parseFloat(String(raw).replace(/[^0-9.-]/g, ''))
                  const unit = Number.isFinite(num) ? num : 0
                  const qty = pricingItemEdits[item.id]?.quantity ?? item.quantity ?? 1
                  return sum + unit * qty
                }, 0)
                return total > 0 ? <span>Quote total: <strong>{formatCurrency(total)}</strong></span> : null
              })()}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setPricingDialogOpen(false)} disabled={isSavingPrices}>
                Cancel
              </Button>
              <Button onClick={handleSavePrices} disabled={isSavingPrices}>
                {isSavingPrices ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : 'Save Prices'}
              </Button>
              {canSendQuote && (order?.status === 'draft' || order?.status === 'submitted') && (
                <Button
                  variant="success"
                  onClick={handleSavePricesAndSendQuote}
                  disabled={isSavingPrices || isSendingQuote}
                >
                  {(isSavingPrices || isSendingQuote)
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Sending…</>
                    : <><Send className="h-4 w-4 mr-1" />Save & Send Quote</>}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Transition Confirmation */}
      <AlertDialog open={!!transitionTarget} onOpenChange={(open) => { if (!open) { setTransitionTarget(null); setTransitionNotes(''); setPaymentMethod(''); setPaymentReference(''); setPaymentNotes('') } }}>
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
              {transitionTarget === 'payment_sent'
                ? 'Record payment details and mark the payment as sent to the customer.'
                : isVendor
                  ? 'This will update your fulfillment progress for the assigned order. You can optionally add a note.'
                  : 'This will update the order status. You can optionally add a note.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            {transitionTarget === 'payment_sent' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="payment-method">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger id="payment-method">
                      <SelectValue placeholder="Select method…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EFT">EFT (Bank Transfer)</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="PayPal">PayPal</SelectItem>
                      <SelectItem value="Wire">Wire Transfer</SelectItem>
                      <SelectItem value="Credit">Credit / Account Credit</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payment-reference">Reference / Transaction ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="payment-reference"
                    placeholder="e.g. TXN-1234"
                    value={paymentReference}
                    onChange={e => setPaymentReference(e.target.value)}
                  />
                </div>
              </>
            )}
            <Textarea
              placeholder="Add a note (optional)..."
              value={transitionNotes}
              onChange={(e) => setTransitionNotes(e.target.value)}
              rows={transitionTarget === 'payment_sent' ? 2 : 3}
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
              {isTransitioning ? 'Updating...' : transitionTarget === 'payment_sent' ? 'Confirm & Mark Sent' : 'Confirm'}
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
            <Button onClick={handleAcceptBid} disabled={isBidActionLoading} variant="success">
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
