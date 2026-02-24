// ============================================================================
// COE RECEIVING PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Package, CheckCircle2, Truck, Search, Clock } from 'lucide-react'
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
import { useDebounce } from '@/hooks/useDebounce'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'
import type { Shipment } from '@/types'

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
  const [isReceiving, setIsReceiving] = useState(false)

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

  const handleReceive = async () => {
    if (!selectedShipment) return
    setIsReceiving(true)
    try {
      const res = await fetch(`/api/shipments/${selectedShipment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'receive', notes: receiveNotes }),
      })
      if (!res.ok) throw new Error()
      toast.success('Shipment marked as received')
      setReceiveDialogOpen(false)
      setSelectedShipment(null)
      setReceiveNotes('')
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
        <Badge variant="outline" className="text-sm px-3 py-1">
          <Clock className="mr-1.5 h-3.5 w-3.5" />{pendingCount} pending
        </Badge>
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
                          onClick={() => { setSelectedShipment(s); setReceiveDialogOpen(true) }}
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
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
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
            <div className="space-y-2">
              <Label>Receiving Notes (optional)</Label>
              <Textarea
                placeholder="Package condition, item count, any issues..."
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
    </div>
  )
}
