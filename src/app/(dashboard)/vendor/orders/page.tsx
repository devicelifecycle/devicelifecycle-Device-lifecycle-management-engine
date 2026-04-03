'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Truck, Send, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { useOrders } from '@/hooks/useOrders'
import { useDebounce } from '@/hooks/useDebounce'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import type { Order, OrderStatus } from '@/types'

function getVendorOrderActionLabel(status: OrderStatus): string {
  switch (status) {
    case 'accepted':
      return 'Accept Job'
    case 'sourcing':
      return 'Mark Sourced'
    case 'sourced':
      return 'Upload Tracking'
    case 'shipped':
      return 'Mark Delivered'
    case 'delivered':
      return 'Complete Fulfillment'
    default:
      return 'Open Order'
  }
}

async function fetchOpenOrders(page = 1) {
  const res = await fetch(`/api/vendors/open-orders?page=${page}&page_size=20`)
  if (!res.ok) throw new Error('Failed to fetch open orders')
  return res.json()
}

export default function VendorOrdersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openOrdersPage, setOpenOrdersPage] = useState(1)
  const debouncedSearch = useDebounce(search)

  const { orders, total, totalPages, isLoading, refetch } = useOrders({
    search: debouncedSearch,
    page,
    page_size: 20,
  })

  const {
    data: openData,
    isLoading: openLoading,
    refetch: refetchOpen,
  } = useQuery({
    queryKey: ['vendor-open-orders', openOrdersPage],
    queryFn: () => fetchOpenOrders(openOrdersPage),
  })
  const openOrders: Order[] = openData?.data || []
  const openTotal = openData?.total ?? 0
  const openTotalPages = openData?.total_pages ?? 1

  // Bid dialog state
  const [bidDialogOpen, setBidDialogOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [bidForm, setBidForm] = useState({
    quantity: '',
    unit_price: '',
    lead_time_days: '',
    warranty_days: '',
    notes: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  function openBidDialog(order: Order) {
    setSelectedOrder(order)
    setBidForm({
      quantity: String(order.total_quantity || 1),
      unit_price: '',
      lead_time_days: '',
      warranty_days: '',
      notes: '',
    })
    setBidDialogOpen(true)
  }

  async function handleSubmitBid() {
    if (!selectedOrder) return

    const quantity = parseInt(bidForm.quantity, 10)
    const unitPrice = parseFloat(bidForm.unit_price)
    const leadTimeDays = parseInt(bidForm.lead_time_days, 10)
    const warrantyDays = bidForm.warranty_days ? parseInt(bidForm.warranty_days, 10) : undefined

    if (!quantity || quantity < 1) {
      toast.error('Quantity must be at least 1')
      return
    }
    if (!unitPrice || unitPrice <= 0) {
      toast.error('Unit price must be greater than 0')
      return
    }
    if (!leadTimeDays || leadTimeDays < 1) {
      toast.error('Lead time must be at least 1 day')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/vendors/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: selectedOrder.id,
          quantity,
          unit_price: unitPrice,
          lead_time_days: leadTimeDays,
          warranty_days: warrantyDays,
          notes: bidForm.notes || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to submit bid')
      }

      const json = await res.json()
      toast.success(json?.data?.auto_accepted ? 'Bid accepted — order assigned to you!' : 'Bid submitted successfully')
      setBidDialogOpen(false)
      refetch()
      refetchOpen()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit bid')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendor Orders</h1>
        <p className="text-muted-foreground mt-1">Browse open CPO orders to bid on, or fulfill orders assigned to you</p>
      </div>

      <Tabs defaultValue="open" className="space-y-4">
        <TabsList>
          <TabsTrigger value="open">
            Open to Bid ({openTotal})
          </TabsTrigger>
          <TabsTrigger value="assigned">
            Assigned to Me ({total})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open to Bid</CardTitle>
              <CardDescription>
                CPO orders broadcast to all vendors. Submit a bid to fulfill — first valid bid for full quantity wins.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {openLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, index) => (
                    <div key={index} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : openOrders.length === 0 ? (
                <div className="text-center py-14">
                  <Inbox className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-medium text-muted-foreground">No open orders</p>
                  <p className="mt-1 text-xs text-muted-foreground">New CPO orders will appear here when customers accept quotes.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openOrders.map((order) => {
                      const status = ORDER_STATUS_CONFIG[order.status as OrderStatus]
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="whitespace-nowrap">
                            <Link href={`/orders/${order.id}`} className="font-medium text-primary hover:underline">
                              {order.order_number}
                            </Link>
                            <p className="text-xs text-muted-foreground mt-0.5">Click for line items</p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant="secondary" className="text-[11px]">
                              {status?.label || order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {order.total_quantity ?? 0}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatRelativeTime(order.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedOrder(order)
                                setBidForm({
                                  quantity: String(order.total_quantity ?? 1),
                                  unit_price: '',
                                  lead_time_days: '',
                                  warranty_days: '',
                                  notes: '',
                                })
                                setBidDialogOpen(true)
                              }}
                            >
                              <Send className="mr-1.5 h-3.5 w-3.5" />
                              Submit Bid
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                </div>
              )}
              <Pagination page={openOrdersPage} totalPages={openTotalPages} onPageChange={setOpenOrdersPage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assigned">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by order number..."
              className="pl-10 bg-background"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <Card>
        <CardHeader>
          <CardTitle className="text-base">Assigned Orders</CardTitle>
          <CardDescription>{total} total order{total === 1 ? '' : 's'}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-14">
              <Truck className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No orders assigned</p>
              <p className="mt-1 text-xs text-muted-foreground">Assigned work will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const status = ORDER_STATUS_CONFIG[order.status as OrderStatus]
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/orders/${order.id}`} className="font-medium text-primary hover:underline">
                          {order.order_number}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">Click to view full details</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {order.type === 'trade_in' ? 'Trade-In' : 'CPO'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="secondary" className="text-[11px]">
                          {status?.label || order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {order.total_quantity ?? 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(order.updated_at || order.created_at)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button asChild size="sm" variant={order.status === 'sourced' ? 'default' : 'outline'}>
                          <Link href={`/orders/${order.id}`}>
                            <Truck className="mr-1.5 h-3.5 w-3.5" />
                            {getVendorOrderActionLabel(order.status as OrderStatus)}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      {/* Submit Bid Dialog — outside Tabs so it works from both Open and Assigned */}
      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Bid</DialogTitle>
            <DialogDescription>
              Submit a bid for order {selectedOrder?.order_number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bid-quantity">Quantity</Label>
              <Input
                id="bid-quantity"
                type="number"
                min={1}
                step={1}
                placeholder="e.g. 50"
                value={bidForm.quantity}
                onChange={(e) => setBidForm(prev => ({ ...prev, quantity: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bid-unit-price">Unit Price ($)</Label>
              <Input
                id="bid-unit-price"
                type="number"
                min={0.01}
                step={0.01}
                placeholder="e.g. 125.00"
                value={bidForm.unit_price}
                onChange={(e) => setBidForm(prev => ({ ...prev, unit_price: e.target.value }))}
              />
            </div>

            {bidForm.quantity && bidForm.unit_price && (
              <p className="text-sm text-muted-foreground">
                Total: {formatCurrency(parseInt(bidForm.quantity, 10) * parseFloat(bidForm.unit_price) || 0)}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="bid-lead-time">Lead Time (days)</Label>
              <Input
                id="bid-lead-time"
                type="number"
                min={1}
                step={1}
                placeholder="e.g. 7"
                value={bidForm.lead_time_days}
                onChange={(e) => setBidForm(prev => ({ ...prev, lead_time_days: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bid-warranty">Warranty (days, optional)</Label>
              <Input
                id="bid-warranty"
                type="number"
                min={1}
                step={1}
                placeholder="e.g. 90"
                value={bidForm.warranty_days}
                onChange={(e) => setBidForm(prev => ({ ...prev, warranty_days: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bid-notes">Notes</Label>
              <Textarea
                id="bid-notes"
                placeholder="Any additional details about your bid..."
                rows={3}
                maxLength={1000}
                value={bidForm.notes}
                onChange={(e) => setBidForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBidDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitBid} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Bid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
