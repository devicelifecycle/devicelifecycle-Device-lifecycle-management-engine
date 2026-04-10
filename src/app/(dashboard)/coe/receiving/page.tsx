// ============================================================================
// COE RECEIVING PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useOnDbChange } from '@/hooks/useOnDbChange'
import { Package, CheckCircle2, Truck, Search, Clock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'
import type { Shipment } from '@/types'
import type { Order } from '@/types'

const CARRIERS = ['FedEx', 'UPS', 'USPS', 'DHL', 'Other']

const COE_ADDRESS = {
  name: 'COE Warehouse',
  street1: '123 COE Dr',
  city: 'Austin',
  state: 'TX',
  postal_code: '73301',
  country: 'US',
}

const statusColors: Record<string, string> = {
  label_created: 'bg-gray-100 text-gray-700',
  picked_up: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-amber-100 text-amber-700',
  out_for_delivery: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  exception: 'bg-red-100 text-red-700',
}

export default function COEReceivingPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [receiveNotes, setReceiveNotes] = useState('')
  const [quantityReceived, setQuantityReceived] = useState('')
  const [isReceiving, setIsReceiving] = useState(false)

  // Record Inbound Shipment
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [orderSearch, setOrderSearch] = useState('')
  const debouncedOrderSearch = useDebounce(orderSearch, 300)
  const [orderResults, setOrderResults] = useState<Order[]>([])
  const [orderSearching, setOrderSearching] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [createForm, setCreateForm] = useState({ carrier: 'FedEx', tracking_number: '' })
  const [isCreating, setIsCreating] = useState(false)

  const buildFromAddress = (order: Order) => {
    const customer = order.customer as unknown as Record<string, unknown> | undefined
    const shipping = customer?.shipping_address as Record<string, unknown> | undefined
    const billing = customer?.billing_address as Record<string, unknown> | undefined
    const source = shipping || billing || {}

    return {
      name: (customer?.contact_name as string) || (customer?.company_name as string) || 'Customer',
      company: (customer?.company_name as string) || undefined,
      street1: (source.street1 as string) || (source.line1 as string) || (source.address1 as string) || 'Unknown',
      street2: (source.street2 as string) || (source.line2 as string) || (source.address2 as string) || undefined,
      city: (source.city as string) || 'Unknown',
      state: (source.state as string) || 'Unknown',
      postal_code: (source.postal_code as string) || (source.zip_code as string) || (source.zip as string) || '00000',
      country: (source.country as string) || 'US',
      phone: (customer?.contact_phone as string) || undefined,
      email: (customer?.contact_email as string) || undefined,
    }
  }

  const fetchShipments = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/shipments?direction=inbound')
      if (res.ok) {
        const data = await res.json()
        setShipments(data.data || [])
      }
    } catch {} finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchShipments() }, [fetchShipments])
  useOnDbChange(fetchShipments)

  useEffect(() => {
    if (!debouncedOrderSearch.trim()) {
      setOrderResults([])
      return
    }
    setOrderSearching(true)
    fetch(`/api/orders?search=${encodeURIComponent(debouncedOrderSearch)}&page=1&page_size=10`)
      .then(res => res.ok ? res.json() : { data: [] })
      .then(r => {
        const data = (r.data || []) as Order[]
        setOrderResults(data.filter(order => ['shipped_to_coe', 'received'].includes(order.status)))
      })
      .catch(() => setOrderResults([]))
      .finally(() => setOrderSearching(false))
  }, [debouncedOrderSearch])

  const handleCreateInbound = async () => {
    if (!selectedOrder) return
    setIsCreating(true)
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: selectedOrder.id,
          direction: 'inbound',
          carrier: createForm.carrier,
          tracking_number: createForm.tracking_number,
          from_address: buildFromAddress(selectedOrder),
          to_address: COE_ADDRESS,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed')
      }
      toast.success('Inbound shipment recorded')
      setCreateDialogOpen(false)
      setSelectedOrder(null)
      setOrderSearch('')
      setCreateForm({ carrier: 'FedEx', tracking_number: '' })
      fetchShipments()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to record shipment')
    } finally { setIsCreating(false) }
  }

  const handleReceive = async () => {
    if (!selectedShipment) return
    setIsReceiving(true)
    try {
      const expectedQty = (selectedShipment.order as unknown as Record<string, number> | undefined)?.total_quantity
      const receivedQty = quantityReceived ? parseInt(quantityReceived, 10) : null
      const countNote = receivedQty != null
        ? `Devices counted: ${receivedQty}${expectedQty && receivedQty !== expectedQty ? ` (expected ${expectedQty} — DISCREPANCY)` : ''}.`
        : ''
      const combinedNotes = [countNote, receiveNotes].filter(Boolean).join(' ').trim()

      const res = await fetch(`/api/shipments/${selectedShipment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'receive', notes: combinedNotes || undefined }),
      })
      if (!res.ok) throw new Error()
      const countSummary = receivedQty != null ? ` — ${receivedQty} device${receivedQty !== 1 ? 's' : ''} counted` : ''
      toast.success(`Shipment received${countSummary}`)
      setReceiveDialogOpen(false)
      setSelectedShipment(null)
      setReceiveNotes('')
      setQuantityReceived('')
      fetchShipments()
    } catch {
      toast.error('Failed to mark shipment as received')
    } finally { setIsReceiving(false) }
  }

  const filtered = shipments.filter(s => {
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      s.tracking_number?.toLowerCase().includes(q) ||
      s.carrier?.toLowerCase().includes(q) ||
      (s.order as unknown as Record<string, string>)?.order_number?.toLowerCase().includes(q)
    )
  })

  const pendingCount = shipments.filter(s => s.status !== 'delivered').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Receiving</h1>
          <p className="text-muted-foreground">Track and receive inbound shipments at COE</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1">
            <Clock className="mr-1.5 h-3.5 w-3.5" />{pendingCount} pending
          </Badge>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Record Inbound Shipment
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by tracking number, carrier, or order..."
          className="pl-10 bg-background"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inbound Shipments</CardTitle>
          <CardDescription>{filtered.length} shipment{filtered.length !== 1 ? 's' : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium">No inbound shipments</p>
              <p className="text-xs mt-1">Shipments will appear here when orders are shipped to COE.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking #</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Est. Delivery</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm font-medium">{s.tracking_number}</TableCell>
                    <TableCell>{s.carrier}</TableCell>
                    <TableCell className="text-sm">
                      {(s.order as unknown as Record<string, string>)?.order_number || '—'}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[s.status] || ''}`}>
                        {s.status.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.estimated_delivery ? formatDateTime(s.estimated_delivery) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatRelativeTime(s.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.status !== 'delivered' ? (
                        <Button
                          size="sm"
                          onClick={() => { setSelectedShipment(s); setQuantityReceived(''); setReceiveNotes(''); setReceiveDialogOpen(true) }}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Receive
                        </Button>
                      ) : (
                        <Badge variant="default"><CheckCircle2 className="mr-1 h-3 w-3" />Received</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Receive Dialog */}
      <Dialog open={receiveDialogOpen} onOpenChange={(open) => {
        setReceiveDialogOpen(open)
        if (!open) { setSelectedShipment(null); setReceiveNotes(''); setQuantityReceived('') }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Receipt</DialogTitle>
            <DialogDescription>
              Mark shipment <span className="font-mono font-medium">{selectedShipment?.tracking_number}</span> as received at COE.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Carrier</p>
                <p className="font-medium">{selectedShipment?.carrier}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Order</p>
                <p className="font-medium">{(selectedShipment?.order as unknown as Record<string, string>)?.order_number || '—'}</p>
              </div>
            </div>

            {/* Device Count Verification */}
            <div className="space-y-2">
              <Label>
                Devices Counted
                {(selectedShipment?.order as unknown as Record<string, number>)?.total_quantity != null && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    (expected {(selectedShipment?.order as unknown as Record<string, number>).total_quantity})
                  </span>
                )}
              </Label>
              <Input
                type="number"
                min={0}
                step={1}
                placeholder="Enter number of devices physically received"
                value={quantityReceived}
                onChange={e => setQuantityReceived(e.target.value)}
              />
              {(() => {
                const expected = (selectedShipment?.order as unknown as Record<string, number>)?.total_quantity
                const received = quantityReceived ? parseInt(quantityReceived, 10) : null
                if (received == null || !expected) return null
                if (received === expected) {
                  return (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />Count matches order — all {expected} devices accounted for
                    </p>
                  )
                }
                return (
                  <p className="text-xs text-amber-600 font-medium">
                    ⚠ Count mismatch — received {received}, expected {expected}. Note will be flagged on the shipment.
                  </p>
                )
              })()}
            </div>

            <div className="space-y-2">
              <Label>Receiving Notes (optional)</Label>
              <Textarea
                placeholder="Package condition, any damage, other observations..."
                value={receiveNotes}
                onChange={e => setReceiveNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleReceive} disabled={isReceiving}>
              {isReceiving ? 'Receiving...' : 'Confirm Receipt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Inbound Shipment Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open)
        if (!open) { setSelectedOrder(null); setOrderSearch(''); setCreateForm({ carrier: 'FedEx', tracking_number: '' }) }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Inbound Shipment</DialogTitle>
            <DialogDescription>
              Create a record when a customer ships devices to COE. Enter order and tracking details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Order</Label>
              {selectedOrder ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="font-medium">{selectedOrder.order_number}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedOrder(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Search by order number..."
                    value={orderSearch}
                    onChange={e => setOrderSearch(e.target.value)}
                  />
                  {orderSearching && <p className="text-xs text-muted-foreground">Searching...</p>}
                  {debouncedOrderSearch && !orderSearching && (
                    <div className="max-h-32 overflow-auto rounded border bg-background">
                      {orderResults.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">No orders found</p>
                      ) : (
                        orderResults.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => { setSelectedOrder(o); setOrderSearch(''); setOrderResults([]) }}
                          >
                            {o.order_number} — {o.status}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>Carrier</Label>
              <Select value={createForm.carrier} onValueChange={v => setCreateForm(f => ({ ...f, carrier: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARRIERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tracking Number</Label>
              <Input
                value={createForm.tracking_number}
                onChange={e => setCreateForm(f => ({ ...f, tracking_number: e.target.value }))}
                placeholder="Enter tracking number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateInbound} disabled={isCreating || !selectedOrder || !createForm.tracking_number}>
              {isCreating ? 'Creating...' : 'Record Shipment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
