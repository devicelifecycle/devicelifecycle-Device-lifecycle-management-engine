// ============================================================================
// ORDER DETAIL PAGE
// ============================================================================

'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, CheckCircle2, AlertTriangle, ChevronRight, DollarSign, Send, FileDown } from 'lucide-react'
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
import { formatCurrency, formatDateTime, snakeToTitle } from '@/lib/utils'
import { ORDER_STATUS_CONFIG, VALID_ORDER_TRANSITIONS, CONDITION_CONFIG } from '@/lib/constants'
import type { OrderStatus } from '@/types'

export default function OrderDetailPage() {
  const params = useParams()
  const { order, isLoading, transition, isTransitioning, refetch } = useOrder(params.id as string)
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false)
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({})
  const [isSavingPrices, setIsSavingPrices] = useState(false)
  const [isSendingQuote, setIsSendingQuote] = useState(false)
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
    // Initialize prices from current items
    const prices: Record<string, string> = {}
    order?.items?.forEach(item => {
      prices[item.id] = item.unit_price?.toString() || ''
    })
    setItemPrices(prices)
    setPricingDialogOpen(true)
  }

  const handleSavePrices = async () => {
    if (!order?.items) return

    setIsSavingPrices(true)
    try {
      const items = order.items.map(item => ({
        id: item.id,
        unit_price: parseFloat(itemPrices[item.id] || '0')
      }))

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
                <div>
                  <p className="text-sm text-muted-foreground">Vendor</p>
                  <p className="font-medium">{order.vendor?.company_name || '—'}</p>
                </div>
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
                    {order.items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.device ? `${item.device.make} ${item.device.model}` : 'Unknown Device'}
                          {item.device?.variant && <span className="text-muted-foreground ml-1">({item.device.variant})</span>}
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
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-4 text-muted-foreground">No items added yet</p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {(order.notes || order.internal_notes) && (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {order.notes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Customer Notes</p>
                    <p className="text-sm">{order.notes}</p>
                  </div>
                )}
                {order.internal_notes && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Internal Notes</p>
                    <p className="text-sm">{order.internal_notes}</p>
                  </div>
                )}
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
              Set the unit price for each item in this order. The total will be automatically calculated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {order?.items?.map(item => (
              <div key={item.id} className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <Label className="text-sm font-medium">
                    {item.device ? `${item.device.make} ${item.device.model}` : 'Unknown Device'}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Qty: {item.quantity} | {item.claimed_condition ? (CONDITION_CONFIG[item.claimed_condition]?.label || item.claimed_condition) : '—'}
                  </p>
                </div>
                <div>
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
