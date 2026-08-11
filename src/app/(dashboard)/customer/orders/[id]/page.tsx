'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle, XCircle, Loader2, Package, Truck,
  MapPin, CheckCircle2, Clock, CreditCard, AlertTriangle,
  ThumbsUp, ThumbsDown, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { useOrder } from '@/hooks/useOrders'
import { formatOrderMoney, orderCurrencyLabel, formatRelativeTime, formatDateTime } from '@/lib/utils'
import { CUSTOMER_STATUS_CONFIG } from '@/lib/constants'
import { toast } from 'sonner'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import type { OrderStatus } from '@/types'

const COE_ADDRESS = {
  name: 'Byte-Back COE Warehouse',
  line1: '123 COE Drive',
  city: 'Toronto',
  province: 'ON',
  postal: 'M1B 2C3',
  country: 'Canada',
}

const CARRIERS = ['FedEx', 'UPS', 'Canada Post', 'USPS', 'DHL', 'Other']

// Trade-in step definitions (customer-facing)
// Reflects the full enterprise inbound flow: quote → ship → inspect → review/pay
const TRADE_IN_STEPS: { statuses: string[]; icon: typeof Truck; label: string; desc: string }[] = [
  { statuses: ['submitted'],                              icon: CheckCircle2, label: 'Submitted',   desc: 'Your device list received' },
  { statuses: ['quoted'],                                  icon: CreditCard,   label: 'Quoted',      desc: 'Quote ready for your review' },
  { statuses: ['accepted'],                                icon: Truck,        label: 'Ship Devices',desc: 'Ship your devices to us' },
  { statuses: ['shipped_to_coe'],                          icon: Truck,        label: 'In Transit',  desc: 'Your devices are on the way to us' },
  { statuses: ['received', 'in_triage', 'qc_complete', 'mismatch_review'], icon: Package, label: 'Inspection', desc: 'We inspect your devices' },
  { statuses: ['payment_processing', 'payment_sent', 'ready_to_ship', 'closed'], icon: CreditCard, label: 'Payment', desc: 'Payment issued to you' },
]

// CPO step definitions (customer-facing) — outbound: COE ships TO customer
const CPO_STEPS: { statuses: string[]; icon: typeof Truck; label: string; desc: string }[] = [
  { statuses: ['submitted'],                              icon: CheckCircle2, label: 'Submitted',  desc: 'Order received' },
  { statuses: ['quoted'],                                  icon: CreditCard,   label: 'Quoted',     desc: 'Quote ready for review' },
  { statuses: ['accepted', 'sourcing', 'sourced'],         icon: Package,      label: 'Sourcing',   desc: 'We source your devices' },
  { statuses: ['shipped', 'ready_to_ship'],                icon: Truck,        label: 'Shipped',    desc: 'Devices on the way' },
  { statuses: ['delivered'],                               icon: CheckCircle,  label: 'Delivered',  desc: 'Devices delivered' },
  { statuses: ['payment_processing', 'payment_sent', 'closed'], icon: CreditCard, label: 'Complete', desc: 'Order complete' },
]

function getStepIndex(steps: typeof TRADE_IN_STEPS, status: string): number {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].statuses.includes(status)) return i
  }
  return -1
}

export default function CustomerOrderDetailPage() {
  const params = useParams()
  const orderId = typeof params.id === 'string' ? params.id : null
  const { order, isLoading, refetch } = useOrder(orderId)
  const [transitioning, setTransitioning] = useState(false)
  const [carrier, setCarrier] = useState('FedEx')
  const [customCarrier, setCustomCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [shippingNotes, setShippingNotes] = useState('')
  const [isSubmittingShipment, setIsSubmittingShipment] = useState(false)
  const [exceptionProcessingId, setExceptionProcessingId] = useState<string | null>(null)
  // Pending triage exceptions (fetched separately — triage_results.id, not order_items.id)
  const [pendingExceptions, setPendingExceptions] = useState<Array<{id: string; imei_record?: Record<string, unknown> | null}>>([])

  useEffect(() => {
    if (!orderId || order?.status !== 'mismatch_review') { setPendingExceptions([]); return }
    fetch(`/api/orders/${orderId}/exceptions`)
      .then(r => r.json())
      .then(d => setPendingExceptions(d.data || []))
      .catch(() => setPendingExceptions([]))
  }, [orderId, order?.status])

  async function handleQuoteAction(action: 'accepted' | 'rejected') {
    if (!order) return
    setTransitioning(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: action }),
      })
      if (!res.ok) throw new Error('Failed to update quote')
      toast.success(
        action === 'accepted'
          ? 'Quote accepted! Please ship your devices to us using the instructions below.'
          : 'Quote declined.'
      )
      refetch?.()
    } catch {
      toast.error('Could not update quote status. Please try again.')
    } finally {
      setTransitioning(false)
    }
  }

  async function handleSubmitShipment() {
    if (!order) return
    const resolvedCarrier = carrier === 'Other' ? customCarrier.trim() : carrier
    if (!resolvedCarrier) { toast.error('Please select or enter a carrier'); return }
    if (!trackingNumber.trim()) { toast.error('Please enter a tracking number'); return }
    setIsSubmittingShipment(true)
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: order.id,
          direction: 'inbound',
          carrier: resolvedCarrier,
          tracking_number: trackingNumber.trim(),
          notes: shippingNotes.trim() || undefined,
          from_address: {},
          to_address: {
            name: COE_ADDRESS.name,
            street1: COE_ADDRESS.line1,
            city: COE_ADDRESS.city,
            state: COE_ADDRESS.province,
            postal_code: COE_ADDRESS.postal,
            country: 'CA',
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to submit shipment')
      toast.success('Shipment submitted! We\'ll track your package and notify you when it arrives.')
      setTrackingNumber('')
      setShippingNotes('')
      refetch?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit shipment')
    } finally {
      setIsSubmittingShipment(false)
    }
  }

  async function handleTransition(toStatus: OrderStatus, notes?: string) {
    if (!order) return
    setTransitioning(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: toStatus, notes }),
      })
      if (!res.ok) throw new Error('Failed to update order status')
      refetch?.()
    } catch {
      toast.error('Could not update order status. Please try again.')
    } finally {
      setTransitioning(false)
    }
  }

  async function handleExceptionDecision(triageResultId: string, approved: boolean) {
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
      // Remove resolved exception from local state immediately
      setPendingExceptions(prev => prev.filter(e => e.id !== triageResultId))
      refetch?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update device condition')
    } finally {
      setExceptionProcessingId(null)
    }
  }

  // Map order_item.id → pending triage_result for that item (via imei_record.order_item_id)
  function getExceptionForItem(itemId: string) {
    return pendingExceptions.find(e => e.imei_record?.['order_item_id'] === itemId) ?? null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <Link href="/customer/orders">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />Back to Orders
          </Button>
        </Link>
        <div className="text-center py-20 text-muted-foreground">
          <Package className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">Order not found</p>
        </div>
      </div>
    )
  }

  const isCpo = order.type === 'cpo'
  const isTradeIn = order.type === 'trade_in'
  const statusCfg = CUSTOMER_STATUS_CONFIG[order.status as OrderStatus]
  const isQuoted = order.status === 'quoted'
  const isAccepted = order.status === 'accepted'
  const isShippedToCoe = isTradeIn && order.status === 'shipped_to_coe'
  const isInProgress = ['received', 'in_triage', 'qc_complete', 'sourcing', 'sourced'].includes(order.status)
  const isMismatchReview = order.status === 'mismatch_review'
  const isPaymentProcessing = order.status === 'payment_processing'
  const isPaymentSent = order.status === 'payment_sent'
  const isShipped = order.status === 'shipped'
  const isDelivered = order.status === 'delivered'
  const isClosed = order.status === 'closed'
  const isCancelled = order.status === 'cancelled'
  const isRejected = order.status === 'rejected'

  const hasMismatchItems = order.items?.some(
    i => i.actual_condition && i.claimed_condition && i.actual_condition !== i.claimed_condition
  ) ?? false

  const quotedAmount = order.quoted_amount ?? order.total_amount ?? 0
  // Amounts are stored in CAD; render them in the order's display currency so a
  // USD quote never shows a CAD figure with a bare "$" (Ryan: avoid confusion).
  const money = (n: number) => formatOrderMoney(n, order.currency, order.fx_rate)
  const currencyLabel = orderCurrencyLabel(order.currency)
  const steps = isCpo ? CPO_STEPS : TRADE_IN_STEPS
  const currentStepIdx = getStepIndex(steps, order.status)

  // Only show confirmed prices once admin has actually sent the quote
  // (status = quoted or later). At 'submitted' status the engine pre-calculates
  // a unit_price but the admin hasn't approved it yet — showing it as a firm
  // number misleads the customer into thinking the price is final.
  const priceConfirmedByAdmin = !['draft', 'submitted'].includes(order.status)
  const hasAnyPrice = order.items?.some(item => (item.unit_price ?? item.guaranteed_buyback_price) != null) ?? false
  const showPriceCol = priceConfirmedByAdmin && (isQuoted || hasAnyPrice)

  function parseItemQty(item: { quantity?: number | null; notes?: string | null }): number {
    const match = item.notes?.match(/\[Original qty:\s*(\d+)\]/i)
    if (match) return parseInt(match[1], 10)
    return item.quantity ?? 1
  }

  function stripInternalNotes(notes: string | null | undefined): string {
    if (!notes) return ''
    return notes.replace(/\[[^\]]*\]\s*\|?\s*/g, '').replace(/^\s*\|\s*/, '').trim()
  }

  const timeline = [
    order.created_at && { label: 'Created', date: order.created_at },
    order.submitted_at && { label: 'Submitted', date: order.submitted_at },
    order.quoted_at && { label: 'Quoted', date: order.quoted_at },
    order.accepted_at && { label: 'Accepted', date: order.accepted_at },
    order.shipped_at && { label: isCpo ? 'Shipped to you' : 'Received by us', date: order.shipped_at },
    order.received_at && { label: 'Devices received', date: order.received_at },
    order.completed_at && { label: isCpo ? 'Delivered' : 'Complete', date: order.completed_at },
  ].filter(Boolean) as { label: string; date: string }[]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/customer/orders">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{order.order_number}</h1>
            <Badge variant="outline" className="text-xs capitalize">{order.type?.replace(/_/g, ' ')}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Updated {formatRelativeTime(order.updated_at || order.created_at)}</p>
        </div>
        <Badge
          className={`text-xs shrink-0 ${statusCfg?.bgColor || 'bg-gray-100'} ${statusCfg?.color || 'text-gray-600'} border-0`}
        >
          {statusCfg?.label || order.status}
        </Badge>
      </div>

      {/* Progress bar */}
      {!isCancelled && !isRejected && (
        <div className="rounded-xl border bg-slate-50/60 dark:bg-slate-900/40 px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            {steps.map((step, i) => {
              const Icon = step.icon
              const isLast = i === steps.length - 1
              // The final step has nothing "after" it, so currentStepIdx can
              // never exceed its index — without this, a fully closed order
              // would show its last stage as "current" (blue) forever
              // instead of "done" (green).
              const isOrderFullyComplete = order.status === 'closed'
              const isDone = currentStepIdx > i || (isLast && currentStepIdx === i && isOrderFullyComplete)
              const isCurrent = currentStepIdx === i && !isDone
              return (
                <div key={step.label} className="flex flex-col items-center flex-1 gap-1.5 text-center">
                  <div className="relative flex items-center w-full justify-center">
                    {i > 0 && (
                      <div className={`absolute right-1/2 top-1/2 -translate-y-1/2 w-[calc(100%-20px)] h-0.5 ${isDone ? 'bg-green-500' : 'bg-muted'}`} />
                    )}
                    <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isDone ? 'bg-green-500 border-green-500 text-white' :
                      isCurrent ? 'bg-primary border-primary text-primary-foreground' :
                      'bg-background border-muted text-muted-foreground'
                    }`}>
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    {!isLast && (
                      <div className={`absolute left-1/2 top-1/2 -translate-y-1/2 w-[calc(100%-20px)] h-0.5 ${isDone ? 'bg-green-500' : 'bg-muted'}`} />
                    )}
                  </div>
                  <p className={`text-[10px] font-semibold leading-tight ${isCurrent ? 'text-primary' : isDone ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {step.label}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SLA transparency — friendly framing, never says "breach" ─────── */}
      {!isCancelled && !isRejected && order.sla?.due_at && (
        <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm ${
          order.sla.is_at_risk
            ? 'border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300'
            : 'border-slate-200 bg-slate-50/60 text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40'
        }`}>
          <Clock className="h-4 w-4 shrink-0" />
          {(order.sla.hours_remaining ?? 0) > 0 ? (
            <span>
              {order.sla.is_at_risk ? 'This step is taking a bit longer than usual — ' : ''}
              Expected by <strong>{formatDateTime(order.sla.due_at)}</strong>
            </span>
          ) : (
            <span>This step is running longer than our usual turnaround — we&apos;re on it.</span>
          )}
        </div>
      )}

      {/* ── QUOTE READY banner ──────────────────────────────────────────── */}
      {isQuoted && (
        <Card className="border-purple-200 bg-purple-50/60 dark:border-purple-800 dark:bg-purple-950/20">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold text-purple-900 dark:text-purple-200">
                  {isCpo ? 'Your CPO quote is ready' : 'Your quote is ready'}
                </p>
                <p className="text-sm text-purple-700 dark:text-purple-300 mt-0.5">
                  Total: <strong>{money(quotedAmount)}</strong>
                  <span className="ml-1.5 inline-flex items-center rounded-full border border-purple-300 dark:border-purple-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide align-middle">{currencyLabel}</span>
                  {isCpo ? ' — CPO devices will be shipped to you after acceptance.' : ' — Accept to proceed with shipping your devices to us.'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="success" className="gap-1.5" disabled={transitioning} onClick={() => handleQuoteAction('accepted')}>
                  {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Accept Quote
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50/60"
                  disabled={transitioning}
                  onClick={() => handleQuoteAction('rejected')}
                >
                  <XCircle className="h-4 w-4" />Decline
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TRADE-IN: NEXT STEP — SHIP YOUR DEVICES ─────────────────────── */}
      {isTradeIn && isAccepted && (
        <Card className="border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-200">
              <Truck className="h-5 w-5" />
              Next Step — Ship Your Devices to Us
            </CardTitle>
            <CardDescription className="text-blue-700 dark:text-blue-300">
              Pack your devices securely and ship them to our COE facility. Enter your tracking number once shipped so we can monitor the arrival.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* COE Address */}
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Ship devices to:</p>
                  <p className="text-sm mt-1 text-slate-700 dark:text-slate-300">{COE_ADDRESS.name}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{COE_ADDRESS.line1}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{COE_ADDRESS.city}, {COE_ADDRESS.province}  {COE_ADDRESS.postal}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{COE_ADDRESS.country}</p>
                </div>
              </div>
            </div>

            {/* Packing tips */}
            <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/10 px-4 py-3">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1.5">Packing tips</p>
              <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-0.5 list-disc ml-4">
                <li>Use a sturdy box with sufficient padding for each device</li>
                <li>Include your order number <strong>{order.order_number}</strong> on a paper inside the box</li>
                <li>Remove all personal data and disable Find My / Factory Reset each device</li>
                <li>Include all original accessories where possible</li>
              </ul>
            </div>

            {/* Submit tracking */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Enter your tracking number once shipped:</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Carrier</label>
                  <Select value={carrier} onValueChange={setCarrier}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARRIERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Tracking Number</label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={e => setTrackingNumber(e.target.value)}
                    placeholder="Enter tracking number"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              {carrier === 'Other' && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Carrier Name</label>
                  <input
                    type="text"
                    value={customCarrier}
                    onChange={e => setCustomCarrier(e.target.value)}
                    placeholder="Enter carrier name"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Notes <span className="font-normal">(optional)</span></label>
                <textarea
                  value={shippingNotes}
                  onChange={e => setShippingNotes(e.target.value)}
                  rows={2}
                  placeholder="Any special instructions…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <Button
                variant="success"
                className="gap-2"
                onClick={handleSubmitShipment}
                disabled={isSubmittingShipment || !trackingNumber.trim()}
              >
                {isSubmittingShipment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {isSubmittingShipment ? 'Submitting…' : 'Submit Tracking'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── CPO: ACCEPTED — sourcing / in progress ───────────────────────── */}
      {isCpo && isAccepted && (
        <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/10">
          <CardContent className="py-4 flex items-start gap-3">
            <Clock className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-blue-800 dark:text-blue-200">We're sourcing your devices</p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                Your CPO order is accepted. Our team is locating the devices and will notify you once they are ready for dispatch. Typical lead time is 3–5 business days.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── IN TRANSIT — devices shipped to COE ─────────────────────────── */}
      {isShippedToCoe && (
        <Card className="border-sky-200 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-950/10">
          <CardContent className="py-4 flex items-start gap-3">
            <Truck className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sky-800 dark:text-sky-200">Your devices are on their way to us</p>
              <p className="text-sm text-sky-700 dark:text-sky-300 mt-0.5">
                We have received your tracking information and are monitoring the shipment. You will be notified as soon as your package arrives at our COE facility.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── IN PROGRESS (inspection / sourcing) ─────────────────────────── */}
      {isInProgress && (
        <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/10">
          <CardContent className="py-4 flex items-start gap-3">
            <Clock className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-blue-800 dark:text-blue-200">
                {isTradeIn ? 'Your devices are being inspected' : 'Sourcing & preparing your devices'}
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                {isTradeIn
                  ? "Our COE team is inspecting each device for condition, functionality, and matching. If anything differs from what was quoted, we'll notify you before processing payment."
                  : "Our team is sourcing your requested devices. You'll receive an update once they are packaged and shipped."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── MISMATCH REVIEW — action required ────────────────────────────── */}
      {isMismatchReview && (
        <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/25 ring-1 ring-amber-300/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Action Required — Device Condition Differences Found
            </CardTitle>
            <CardDescription className="text-amber-700 dark:text-amber-300">
              Our inspection found that one or more devices arrived in a different condition than reported.
              Please review the details below, then approve the updated quote or contact us to dispute.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasMismatchItems && order.items
              ?.filter(i => i.actual_condition && i.claimed_condition && i.actual_condition !== i.claimed_condition)
              .map(item => {
                const device = item.device ? `${item.device.make} ${item.device.model}` : 'Device'
                const pendingEx = getExceptionForItem(item.id)
                const isProcessing = exceptionProcessingId === (pendingEx?.id ?? item.id)
                const isResolved = !pendingEx
                return (
                  <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white dark:bg-slate-900 p-3">
                    <div>
                      <p className="font-medium text-sm">{device}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Reported: <strong className="capitalize">{item.claimed_condition}</strong>
                        {' → '}
                        Inspected: <strong className="capitalize text-amber-700 dark:text-amber-400">{item.actual_condition}</strong>
                        {item.unit_price != null && (
                          <span className="ml-2 font-medium text-slate-700 dark:text-slate-300">· Revised price: {money(item.unit_price)}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {isResolved ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Reviewed</span>
                      ) : (
                        <>
                          <Button size="sm" variant="success" disabled={isProcessing}
                            onClick={() => pendingEx && handleExceptionDecision(pendingEx.id, true)}>
                            {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                            <span className="ml-1.5">Approve</span>
                          </Button>
                          <Button size="sm" variant="destructive" disabled={isProcessing}
                            onClick={() => pendingEx && handleExceptionDecision(pendingEx.id, false)}>
                            <ThumbsDown className="h-3.5 w-3.5" />
                            <span className="ml-1.5">Dispute</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            <div className="pt-1 border-t border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                Once you approve all items above, click below to confirm the revised quote and proceed to payment.
              </p>
              <Button
                variant="success"
                className="gap-2"
                disabled={transitioning || pendingExceptions.length > 0}
                onClick={() => handleTransition('payment_processing', 'Customer approved revised quote after mismatch review')}
              >
                {transitioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Confirm Revised Quote & Proceed to Payment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PAYMENT PROCESSING ───────────────────────────────────────────── */}
      {isPaymentProcessing && (
        <Card className="border-teal-200 bg-teal-50/40 dark:border-teal-800 dark:bg-teal-950/10">
          <CardContent className="py-4 flex items-start gap-3">
            <CreditCard className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-teal-800 dark:text-teal-200">Payment is being processed</p>
              <p className="text-sm text-teal-700 dark:text-teal-300 mt-0.5">
                All devices have been verified and your payment of{' '}
                <strong>{money(order.final_amount ?? quotedAmount)}</strong> is being prepared.
                You will receive a notification once it has been sent — typically within 1–2 business days.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PAYMENT SENT ─────────────────────────────────────────────────── */}
      {isPaymentSent && (
        <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/10">
          <CardContent className="py-4 flex items-start gap-3">
            <CreditCard className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-200">Payment has been sent!</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">
                Your payment of{' '}
                <strong>{money(order.final_amount ?? quotedAmount)}</strong>{' '}
                has been processed
                {order.payment_method ? ` via ${order.payment_method}` : ''}.
                Please allow 1–2 business days for it to reflect in your account.
                {order.payment_reference && (
                  <span className="ml-1 text-xs font-mono">Ref: {order.payment_reference}</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legacy ready_to_ship payment stage (CPO / old flow) */}
      {order.status === 'ready_to_ship' && (
        <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/10">
          <CardContent className="py-4 flex items-start gap-3">
            <Package className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-200">Order ready — preparing dispatch</p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                All devices have passed quality check. We are preparing your shipment and will notify you with tracking information once dispatched.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── SHIPPED (CPO) ──────────────────────────────────────────────────── */}
      {isShipped && (
        <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/10">
          <CardContent className="py-4 flex items-start gap-3">
            <Truck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-blue-800 dark:text-blue-200">Your devices are on the way!</p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                Your CPO devices have been dispatched. Check the shipment tracking below to monitor delivery.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── DELIVERED / CLOSED ─────────────────────────────────────────────── */}
      {(isDelivered || isClosed) && (
        <Card className="border-green-200 bg-green-50/40 dark:border-green-800 dark:bg-green-950/10">
          <CardContent className="py-4 flex items-start gap-3">
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-800 dark:text-green-200">
                {isCpo ? 'Devices delivered — order complete!' : 'Order complete!'}
              </p>
              <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">
                {isCpo
                  ? 'Your CPO devices have been delivered. Thank you for your order!'
                  : `Your trade-in is complete. Thank you! Final amount: ${money(order.final_amount ?? quotedAmount)}.`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Post-completion NPS survey ───────────────────────────────────── */}
      {isClosed && orderId && <NpsSurveyCard orderId={orderId} />}

      {/* Order Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Order Type</p>
          <p className="font-semibold capitalize mt-1">{order.type?.replace(/_/g, ' ') || '—'}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">Total Devices</p>
          <p className="font-semibold mt-1">{order.total_quantity ?? '—'}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">
            {isQuoted ? 'Quoted Amount' : order.status === 'payment_sent' || isClosed ? 'Final Amount' : priceConfirmedByAdmin ? 'Amount' : 'Est. Amount'}
          </p>
          <p className="font-semibold mt-1">
            {(order.final_amount ?? 0) > 0
              ? money(order.final_amount!)
              : quotedAmount > 0
                ? priceConfirmedByAdmin
                  ? money(quotedAmount)
                  : `Est. ${money(quotedAmount)}`
                : '—'}
          </p>
          {!priceConfirmedByAdmin && quotedAmount > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">Pending admin quote</p>
          )}
        </CardContent></Card>
      </div>

      {/* Line Items */}
      {order.items && order.items.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Devices</CardTitle>
            <CardDescription>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    {showPriceCol && <TableHead className="text-right">Unit Price</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => {
                    const device = item.device ? `${item.device.make || ''} ${item.device.model || ''}`.trim() : '—'
                    const unitPrice = item.unit_price ?? item.guaranteed_buyback_price ?? null
                    const displayQty = parseItemQty(item)
                    const itemNote = stripInternalNotes(item.notes)
                    const hasMismatch = item.actual_condition && item.claimed_condition && item.actual_condition !== item.claimed_condition
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <div>{device}</div>
                          {itemNote && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              <span className="text-xs text-amber-600 dark:text-amber-400">{itemNote}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.storage || '—'}</TableCell>
                        <TableCell className="text-sm">
                          <span className="capitalize">{(item.claimed_condition || '—').replace(/_/g, ' ')}</span>
                          {hasMismatch && (
                            <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">
                              → {item.actual_condition}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{displayQty}</TableCell>
                        {showPriceCol && (
                          <TableCell className="text-right tabular-nums font-medium">
                            {unitPrice != null ? money(unitPrice) : '—'}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shipments */}
      {order.shipments && order.shipments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Shipment Tracking</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {order.shipments.map((shipment: { id: string; carrier: string; tracking_number: string; direction: string; status: string; estimated_delivery?: string }) => {
                const carrierLower = (shipment.carrier || '').toLowerCase()
                const tn = encodeURIComponent(shipment.tracking_number || '')
                const trackUrl = carrierLower.includes('ups') ? `https://www.ups.com/track?tracknum=${tn}`
                  : carrierLower.includes('fedex') ? `https://www.fedex.com/fedextrack/?trknbr=${tn}`
                  : carrierLower.includes('canada post') || carrierLower.includes('canadapost') ? `https://www.canadapost-postescanada.ca/track-reperage/en#/detail/${tn}`
                  : carrierLower.includes('usps') ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tn}`
                  : carrierLower.includes('dhl') ? `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`
                  : null
                return (
                  <div key={shipment.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-medium">{shipment.tracking_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {shipment.carrier} · {shipment.direction === 'inbound' ? 'To our facility' : 'To you'}
                        {shipment.estimated_delivery && ` · ETA ${formatDateTime(shipment.estimated_delivery)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-xs capitalize">{shipment.status?.replace(/_/g, ' ')}</Badge>
                      {trackUrl && (
                        <a href={trackUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" />Track
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

      {/* Timeline */}
      {timeline.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative pl-4">
              <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {timeline.map((event, i) => (
                  <div key={i} className="relative flex items-start gap-3">
                    <div className="absolute -left-4 mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary ring-2 ring-background" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{event.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(event.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {order.notes && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function NpsSurveyCard({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(true)
  const [existingResponse, setExistingResponse] = useState<{ score: number; comment: string | null } | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/orders/${orderId}/nps`)
      .then((r) => r.json())
      .then((data) => setExistingResponse(data.response || null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [orderId])

  async function handleSubmit() {
    if (score == null) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/nps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, comment: comment || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit feedback')
      setExistingResponse({ score, comment: comment || null })
      toast.success('Thanks for your feedback!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit feedback')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  if (existingResponse) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Thanks for your feedback — you rated this order {existingResponse.score}/10.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">How was your experience?</CardTitle>
        <CardDescription>How likely are you to recommend us to a friend or colleague?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${
                score === n ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground px-0.5">
          <span>Not likely</span>
          <span>Very likely</span>
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Anything we could improve? (optional)"
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button onClick={handleSubmit} disabled={score == null || submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Feedback
        </Button>
      </CardContent>
    </Card>
  )
}
