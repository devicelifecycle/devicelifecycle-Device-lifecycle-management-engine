// ============================================================================
// COE SHIPPING PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Truck, Search, Package, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'
import type { Shipment } from '@/types'
import type { Order } from '@/types'

const statusColors: Record<string, string> = {
  label_created: 'bg-gray-100 text-gray-700',
  picked_up: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-amber-100 text-amber-700',
  out_for_delivery: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  exception: 'bg-red-100 text-red-700',
}

const CARRIERS = ['FedEx', 'UPS', 'USPS', 'DHL', 'Other']
const STATUSES = ['label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const

export default function COEShippingPage() {
  const [outbound, setOutbound] = useState<Shipment[]>([])
  const [allShipments, setAllShipments] = useState<Shipment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)

  // Create shipment dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [orderSearch, setOrderSearch] = useState('')
  const debouncedOrderSearch = useDebounce(orderSearch, 300)
  const [orderResults, setOrderResults] = useState<Order[]>([])
  const [orderSearching, setOrderSearching] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [form, setForm] = useState({
    carrier: 'FedEx',
    tracking_number: '',
  })

  // Update status dialog
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [newStatus, setNewStatus] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const fetchShipments = useCallback(async () => {
    setIsLoading(true)
    try {
      const [outRes, allRes] = await Promise.all([
        fetch('/api/shipments?direction=outbound'),
        fetch('/api/shipments'),
      ])
      if (outRes.ok) { const d = await outRes.json(); setOutbound(d.data || []) }
      if (allRes.ok) { const d = await allRes.json(); setAllShipments((d.data || []).filter((s: Shipment) => s.direction === 'outbound')) }
    } catch {} finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchShipments() }, [fetchShipments])

  useEffect(() => {
    if (!debouncedOrderSearch.trim()) {
      setOrderResults([])
      return
    }
    setOrderSearching(true)
    fetch(`/api/orders?search=${encodeURIComponent(debouncedOrderSearch)}&page=1&page_size=10`)
      .then(res => res.ok ? res.json() : { data: [] })
      .then(r => setOrderResults(r.data || []))
      .catch(() => setOrderResults([]))
      .finally(() => setOrderSearching(false))
  }, [debouncedOrderSearch])

  const handleCreateShipment = async () => {
    if (!selectedOrder) return
    setIsCreating(true)
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: selectedOrder.id,
          direction: 'outbound',
          carrier: form.carrier,
          tracking_number: form.tracking_number,
          from_address: { name: 'COE Warehouse', street1: '123 COE Dr', city: 'Austin', state: 'TX', postal_code: '73301', country: 'US' },
          to_address: { name: 'Customer', street1: 'TBD', city: 'TBD', state: 'TBD', postal_code: '00000', country: 'US' },
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Shipment created')
      setCreateDialogOpen(false)
      setSelectedOrder(null)
      setOrderSearch('')
      setForm({ carrier: 'FedEx', tracking_number: '' })
      fetchShipments()
    } catch {
      toast.error('Failed to create shipment')
    } finally { setIsCreating(false) }
  }

  const handleUpdateStatus = async () => {
    if (!selectedShipment || !newStatus) return
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/shipments/${selectedShipment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast.success('Shipment status updated')
      setUpdateDialogOpen(false)
      setSelectedShipment(null)
      setNewStatus('')
      fetchShipments()
    } catch {
      toast.error('Failed to update status')
    } finally { setIsUpdating(false) }
  }

  const filterShipments = (list: Shipment[]) => {
    if (!debouncedSearch) return list
    const q = debouncedSearch.toLowerCase()
    return list.filter(s =>
      s.tracking_number?.toLowerCase().includes(q) ||
      s.carrier?.toLowerCase().includes(q) ||
      (s.order as unknown as Record<string, string>)?.order_number?.toLowerCase().includes(q)
    )
  }

  const ShipmentTable = ({ shipments, showActions }: { shipments: Shipment[]; showActions?: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tracking #</TableHead>
          <TableHead>Carrier</TableHead>
          <TableHead>Order</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          {showActions && <TableHead className="text-right">Action</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {shipments.map(s => (
          <TableRow key={s.id}>
            <TableCell className="font-mono text-sm font-medium">{s.tracking_number}</TableCell>
            <TableCell>{s.carrier}</TableCell>
            <TableCell className="text-sm">{(s.order as unknown as Record<string, string>)?.order_number || '—'}</TableCell>
            <TableCell>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[s.status] || ''}`}>
                {s.status.replace(/_/g, ' ')}
              </span>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatRelativeTime(s.created_at)}</TableCell>
            {showActions && (
              <TableCell className="text-right">
                {s.status !== 'delivered' && (
                  <Button size="sm" variant="outline" onClick={() => { setSelectedShipment(s); setNewStatus(''); setUpdateDialogOpen(true) }}>
                    Update Status
                  </Button>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shipping</h1>
          <p className="text-muted-foreground">Manage outbound shipments to customers</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Send className="mr-2 h-4 w-4" />New Shipment
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by tracking number, carrier, or order..." className="pl-10 bg-background" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Tabs defaultValue="ready">
        <TabsList>
          <TabsTrigger value="ready">Ready to Ship ({outbound.length})</TabsTrigger>
          <TabsTrigger value="all">All Outbound ({allShipments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ready" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ready to Ship</CardTitle>
              <CardDescription>Outbound shipments with labels created, awaiting pickup</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              ) : filterShipments(outbound).length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <Package className="h-10 w-10 mb-3 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No shipments ready</p>
                  <p className="text-xs mt-1">Create a shipment when orders pass QC and are ready to ship.</p>
                </div>
              ) : (
                <ShipmentTable shipments={filterShipments(outbound)} showActions />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Outbound Shipments</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />)}</div>
              ) : filterShipments(allShipments).length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground">
                  <Truck className="h-10 w-10 mb-3 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No outbound shipments yet</p>
                </div>
              ) : (
                <ShipmentTable shipments={filterShipments(allShipments)} showActions />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Shipment Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open)
        if (!open) { setSelectedOrder(null); setOrderSearch(''); setForm({ carrier: 'FedEx', tracking_number: '' }) }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Outbound Shipment</DialogTitle>
            <DialogDescription>Select the order and enter tracking details for the outbound shipment.</DialogDescription>
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
              <Select value={form.carrier} onValueChange={v => setForm(f => ({ ...f, carrier: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARRIERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tracking Number</Label>
              <Input value={form.tracking_number} onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))} placeholder="Enter tracking number" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateShipment} disabled={isCreating || !selectedOrder || !form.tracking_number}>
              {isCreating ? 'Creating...' : 'Create Shipment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Shipment Status</DialogTitle>
            <DialogDescription>
              Tracking: <span className="font-mono font-medium">{selectedShipment?.tracking_number}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStatus} disabled={isUpdating || !newStatus}>
              {isUpdating ? 'Updating...' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
