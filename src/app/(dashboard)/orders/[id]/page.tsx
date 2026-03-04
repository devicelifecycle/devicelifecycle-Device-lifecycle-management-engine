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

export default function OrderDetailPage() {
  const params = useParams()
  const { user } = useAuth()
  const isCustomer = user?.role === 'customer'
  const { order, isLoading, transition, isTransitioning, refetch } = useOrder(params.id as string)
  const { shipments: orderShipments } = useOrderShipments(params.id as string)
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false)
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({})
  const [itemMetadata, setItemMetadata] = useState<Record<string, PricingMetadata>>({})
  const [expandedPricingContext, setExpandedPricingContext] = useState<string | null>(null)
  const [isSavingPrices, setIsSavingPrices] = useState(false)
  const [isSendingQuote, setIsSendingQuote] = useState(false)
  const [suggestingItemId, setSuggestingItemId] = useState<string | null>(null)
  const [suggestingAll, setSuggestingAll] = useState(false)
  const [transitionTarget, setTransitionTarget] = useState<OrderStatus | null>(null)
  const [transitionNotes, setTransitionNotes] = useState('')

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

  const handleSuggestAll = async () => {
    if (!order?.items?.length) return
    setSuggestingAll(true)
    let successCount = 0
    for (const item of order.items) {
      if (!item.device_id) continue
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
        if (!res.ok) continue
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
          successCount++
        }
      } catch {
        // continue to next item
      }
    }
    setSuggestingAll(false)
    toast.success(`Suggested prices for ${successCount} of ${order.items.length} items`)
  }

  const handleSavePrices = async () => {
    if (!order?.items) return

    setIsSavingPrices(true)
    try {
      const items = order.items.map(item => {
        const payload: { id: string; unit_price: number; pricing_metadata?: PricingMetadata } = {
          id: item.id,
          unit_price: parseFloat(itemPrices[item.id] || '0'),
        }
        if (item.id in itemMetadata) payload.pricing_metadata = itemMetadata[item.id]
        return payload
      })

      const response = await fetch(`/api/orders/${params.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      })

      if (!response.ok) throw new Error('Failed to update prices')

      toast.success('Prices updated successfully')
      setPricingDialogOpen(false)
      refetch()
    } catch (error) {
      toast.error('Failed to update prices')
    } finally {
      setIsSavingPrices(false)
    }
  }

  const handleSendQuote = async () => {
    setIsSendingQuote(true)
    try {
      // Transition order to "quoted" status and create notification
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
  const availableTransitions = VALID_ORDER_TRANSITIONS[order.status] || []

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
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{order.customer?.company_name || '—'}</p>
                </div>
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

              {/* Pricing and Quote Actions */}
              {order.status !== 'cancelled' && order.status !== 'closed' && (
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
                  {(order.status === 'quoted' || order.quoted_amount) && (
                    <Button
                      variant="default"
                      className="w-full justify-between"
                      disabled={isSendingQuote}
                      onClick={handleSendQuote}
                    >
                      <span className="flex items-center gap-2">
                        <Send className="h-4 w-4" />
                        Send Quote
                      </span>
                    </Button>
                  )}
                </>
              )}

              {/* Split Order Button */}
              {order.status === 'sourcing' && !order.is_split_order && !order.parent_order_id && (
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
                  <p className="text-xs text-muted-foreground font-medium mb-1">Move to:</p>
                  {availableTransitions.map(nextStatus => {
                    const nextConfig = ORDER_STATUS_CONFIG[nextStatus]
                    const isDestructive = nextStatus === 'cancelled' || nextStatus === 'rejected'
                    return (
                      <Button
                        key={nextStatus}
                        variant={isDestructive ? 'destructive' : 'outline'}
                        className="w-full justify-between"
                        disabled={isTransitioning}
                        onClick={() => setTransitionTarget(nextStatus)}
                      >
                        {nextConfig?.label || snakeToTitle(nextStatus)}
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
              Set the unit price for each item. Use &quot;Suggest Price&quot; to get market-based recommendations, or enter manually.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={suggestingAll || !order?.items?.length}
                onClick={handleSuggestAll}
              >
                {suggestingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-2">{suggestingAll ? 'Suggesting...' : 'Suggest All'}</span>
              </Button>
            </div>
            {order?.items?.map(item => (
              <div key={item.id} className="grid grid-cols-[1fr_auto_140px] gap-4 items-end">
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={suggestingAll || !item.device_id || !!suggestingItemId}
                  onClick={() => handleSuggestPrice(item)}
                >
                  {suggestingItemId === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span className="ml-1">{suggestingItemId === item.id ? '...' : 'Suggest'}</span>
                </Button>
              </div>
            ))}
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
