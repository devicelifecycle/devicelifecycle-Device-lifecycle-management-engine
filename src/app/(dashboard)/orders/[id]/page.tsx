// ============================================================================
// ORDER DETAIL PAGE
// ============================================================================

'use client'

import { useState, Fragment } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, CheckCircle2, AlertTriangle, ChevronRight, ChevronDown, ChevronUp, DollarSign, Send, FileDown, Sparkles, Loader2, GitBranch, ExternalLink, Truck, Package } from 'lucide-react'
import { toast } from 'sonner'
import { useOrder } from '@/hooks/useOrders'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { useAuth } from '@/hooks/useAuth'
import { useOrderShipments } from '@/hooks/useShipments'
import { formatCurrency, formatDateTime, snakeToTitle } from '@/lib/utils'
import { ORDER_STATUS_CONFIG, VALID_ORDER_TRANSITIONS, CONDITION_CONFIG, STORAGE_OPTIONS } from '@/lib/constants'
import type { OrderStatus, OrderItem, PricingMetadata } from '@/types'

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

export default function OrderDetailPage() {
  const params = useParams()
  const { user } = useAuth()
  const isCustomer = user?.role === 'customer'
  const isVendor = user?.role === 'vendor'
  const canSetPricingByRole = user?.role === 'admin' || user?.role === 'coe_manager'
  const { order, isLoading, transition, isTransitioning, refetch } = useOrder(params.id as string)
  const isCpoOrder = order?.type === 'cpo'
  const canSetPricing = isCpoOrder ? user?.role === 'admin' : canSetPricingByRole
  const { shipments: orderShipments } = useOrderShipments(params.id as string)
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false)
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({})
  const [itemMetadata, setItemMetadata] = useState<Record<string, PricingMetadata>>({})
  const [expandedPricingContext, setExpandedPricingContext] = useState<string | null>(null)
  const [isSavingPrices, setIsSavingPrices] = useState(false)
  const [isSendingQuote, setIsSendingQuote] = useState(false)
  const [suggestingItemId, setSuggestingItemId] = useState<string | null>(null)
  const [transitionTarget, setTransitionTarget] = useState<OrderStatus | null>(null)
  const [transitionNotes, setTransitionNotes] = useState('')
  // Market context: competitor prices for each device in pricing dialog
  const [marketContext, setMarketContext] = useState<Record<string, {
    loading: boolean
    conditions: { condition: string; avg_trade: number; avg_cpo: number; competitors: { name: string; trade: number | null; sell: number | null }[] }[]
  }>>({})

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

  const handleOpenPricingDialog = () => {
    const prices: Record<string, string> = {}
    const metadata: Record<string, PricingMetadata> = {}
    order?.items?.forEach(item => {
      prices[item.id] = item.unit_price?.toString() || ''
      if (item.pricing_metadata) metadata[item.id] = item.pricing_metadata
    })
    setItemPrices(prices)
    setItemMetadata(metadata)
    setPricingDialogOpen(true)
    // Fetch competitor market context for all devices
    if (order?.items) fetchMarketContext(order.items)
  }

  const getStorageForItem = (item: OrderItem): string => {
    if (item.storage && STORAGE_OPTIONS.includes(item.storage)) return item.storage
    const variant = item.device?.variant || ''
    const match = STORAGE_OPTIONS.find(s => variant.includes(s))
    return match || '128GB'
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
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to calculate price')
      }
      const result = await res.json()
      if (result.success && result.trade_price != null) {
        const unitPrice = result.quantity ? result.trade_price / result.quantity : result.trade_price
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
      if (item.id in itemMetadata) payload.pricing_metadata = itemMetadata[item.id]
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

  const handleSendQuote = async () => {
    setIsSendingQuote(true)
    try {
      // If order is draft, first transition to submitted, then to quoted
      if (order?.status === 'draft') {
        await transition({ status: 'submitted' as OrderStatus, notes: 'Auto-submitted for quoting' })
      }
      await transition({ status: 'quoted' as OrderStatus, notes: 'Quote sent to customer' })
      toast.success('Quote sent to customer')
    } catch {
      toast.error('Failed to send quote')
    } finally {
      setIsSendingQuote(false)
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
        <Link href="/orders"><Button variant="outline" className="mt-4">Back to Orders</Button></Link>
      </div>
    )
  }

  const statusConfig = ORDER_STATUS_CONFIG[order.status]
  const rawTransitions = VALID_ORDER_TRANSITIONS[order.status] || []
  // Customer can only: submit (draft->submitted), cancel draft, accept/reject quote
  const customerAllowedTransitions: OrderStatus[] =
    order.status === 'draft' ? ['submitted', 'cancelled'] :
    order.status === 'quoted' ? ['accepted', 'rejected'] : []
  const availableTransitions = isCustomer
    ? rawTransitions.filter((s: OrderStatus) => customerAllowedTransitions.includes(s))
    : rawTransitions

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/orders"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{order.order_number}</h1>
              <Badge variant="outline" className="capitalize">{order.type.replace('_', ' ')}</Badge>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig?.bgColor || ''} ${statusConfig?.color || ''}`}
              >
                {statusConfig?.label}
              </span>
              {order.is_sla_breached && (
                <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />SLA Breached</Badge>
              )}
            </div>
            <p className="text-muted-foreground">{statusConfig?.description}</p>
          </div>
        </div>
      </div>

      {/* Quote ready — customer accepts or rejects */}
      {isCustomer && order.status === 'quoted' && (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/20">
          <CardContent className="py-4">
            <p className="font-medium text-green-800 dark:text-green-200">Quote ready for your review</p>
            <p className="text-sm text-green-700 dark:text-green-300/90 mt-1">
              Your quote total is {formatCurrency(order.quoted_amount || order.total_amount || 0)}. Accept to proceed or reject if you&apos;d like to decline.
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
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="font-medium">{formatCurrency(order.total_amount || 0)}</p>
                </div>
                {order.quoted_amount && (
                  <div>
                    <p className="text-sm text-muted-foreground">Quoted Amount</p>
                    <p className="font-medium">{formatCurrency(order.quoted_amount)}</p>
                  </div>
                )}
                {order.final_amount && (
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
            <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
            <CardContent>
              {order.items && order.items.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
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
                                <span className={CONDITION_CONFIG[item.claimed_condition]?.color}>
                                  {CONDITION_CONFIG[item.claimed_condition]?.label}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{item.unit_price ? formatCurrency(item.unit_price) : '—'}</TableCell>
                            <TableCell className="text-right">
                              {item.unit_price ? formatCurrency(item.unit_price * item.quantity) : '—'}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={5} className="bg-muted/30 py-3">
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
                                  {hasContext && (
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
              ) : (
                <p className="text-center py-4 text-muted-foreground">No items added yet</p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {(order.notes || (!isCustomer && order.internal_notes)) && (
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

          {/* Shipments Section */}
          {orderShipments.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <CardTitle>Shipments</CardTitle>
                </div>
                <CardDescription>
                  {orderShipments.length} shipment{orderShipments.length !== 1 ? 's' : ''} for this order
                </CardDescription>
              </CardHeader>
              <CardContent>
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
            <CardHeader><CardTitle>Actions</CardTitle><CardDescription>Manage this order</CardDescription></CardHeader>
            <CardContent className="space-y-2">
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
                    onClick={handleOpenPricingDialog}
                  >
                    <span className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Set Pricing
                    </span>
                  </Button>
                  {/* Show Send Quote when prices are set and order can be moved to quoted */}
                  {(order.status === 'draft' || order.status === 'submitted') && (order.quoted_amount || order.total_amount) && (order.quoted_amount || order.total_amount || 0) > 0 && (
                    <Button
                      variant="default"
                      className="w-full justify-between"
                      disabled={isSendingQuote || isTransitioning}
                      onClick={handleSendQuote}
                    >
                      <span className="flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        {isSendingQuote ? 'Sending...' : 'Send Quote'}
                      </span>
                    </Button>
                  )}
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

              {/* Status Transitions */}
              {availableTransitions.length > 0 && (
                <>
                  <Separator className="my-2" />
                  <p className="text-xs text-muted-foreground font-medium mb-1">
                    {isCustomer && order.status === 'quoted' ? 'Your decision:' : 'Move to:'}
                  </p>
                  {availableTransitions.map(nextStatus => {
                    const nextConfig = ORDER_STATUS_CONFIG[nextStatus]
                    const isDestructive = nextStatus === 'cancelled' || nextStatus === 'rejected'
                    const label = isCustomer && order.status === 'quoted' && nextStatus === 'accepted'
                      ? 'Accept Quote'
                      : isCustomer && order.status === 'quoted' && nextStatus === 'rejected'
                        ? 'Reject Quote'
                        : nextConfig?.label || snakeToTitle(nextStatus)
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
                      <p className="text-sm font-medium">{statusConfig?.label}</p>
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set Item Pricing</DialogTitle>
            <DialogDescription>
              {isCpoOrder
                ? 'Set the unit price for each item manually. Suggested pricing is disabled for CPO orders.'
                : 'Set the unit price for each item. Use "Suggest Price" to get market-based recommendations, or enter manually.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {order?.items?.map(item => {
              const ctxKey = `${item.device_id}_${getStorageForItem(item)}`
              const ctx = marketContext[ctxKey]
              const itemCondition = mapOrderConditionToCompetitorCondition(item.claimed_condition || 'good')
              const conditionSnapshot = ctx?.conditions.find(c => c.condition === itemCondition)
              return (
                <div key={item.id} className="rounded-lg border p-4 space-y-3">
                  {/* Item header + price input */}
                  <div className={`grid ${isCpoOrder ? 'grid-cols-[1fr_auto]' : 'grid-cols-[1fr_auto_140px]'} gap-4 items-end`}>
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
                  </div>

                  {!!conditionSnapshot && (
                    <div className="rounded-md border bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Market reference</span>
                          <span className="mx-1">•</span>
                          <span className="capitalize">{conditionSnapshot.condition}</span>
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
                                {Array.from(new Set(c.competitors.map(comp => comp.name))).join(', ')}
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
              Move to {transitionTarget ? (ORDER_STATUS_CONFIG[transitionTarget]?.label || transitionTarget) : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will update the order status. You can optionally add a note.
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
    </div>
  )
}
