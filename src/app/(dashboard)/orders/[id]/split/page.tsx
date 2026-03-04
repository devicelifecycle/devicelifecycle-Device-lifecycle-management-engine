// ============================================================================
// ORDER SPLIT PLANNING PAGE
// Allows allocating order items across multiple vendors
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, GitBranch, Plus, Trash2, AlertCircle, CheckCircle2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/utils'
import type { Order, OrderItem, Vendor, VendorBid } from '@/types'

interface VendorAllocation {
  vendor_id: string
  vendor_name: string
  items: Record<string, number> // order_item_id → quantity
}

/**
 * Build pre-filled allocations from accepted vendor bids.
 * Distributes order item quantities proportionally based on bid quantities.
 */
function buildPrefilledAllocations(
  acceptedBids: VendorBid[],
  orderItems: OrderItem[]
): VendorAllocation[] {
  if (acceptedBids.length === 0 || orderItems.length === 0) return []

  const totalBidQty = acceptedBids.reduce(
    (sum, b) => sum + ((b as any).quantity_offered || b.quantity || 0), 0
  )
  if (totalBidQty === 0) return []

  const allocations: VendorAllocation[] = acceptedBids.map(bid => ({
    vendor_id: bid.vendor_id,
    vendor_name: bid.vendor?.company_name || 'Unknown Vendor',
    items: {},
  }))

  for (const item of orderItems) {
    const shares = acceptedBids.map(bid => {
      const bidQty = (bid as any).quantity_offered || bid.quantity || 0
      const exactShare = (bidQty / totalBidQty) * item.quantity
      return {
        vendor_id: bid.vendor_id,
        floor: Math.floor(exactShare),
        remainder: exactShare - Math.floor(exactShare),
      }
    })

    let distributed = shares.reduce((sum, s) => sum + s.floor, 0)
    const remaining = item.quantity - distributed
    const sorted = [...shares].sort((a, b) => b.remainder - a.remainder)
    for (let i = 0; i < remaining; i++) {
      sorted[i].floor += 1
    }

    for (const share of shares) {
      if (share.floor > 0) {
        const alloc = allocations.find(a => a.vendor_id === share.vendor_id)
        if (alloc) alloc.items[item.id] = share.floor
      }
    }
  }

  return allocations.filter(a => Object.keys(a.items).length > 0)
}

export default function OrderSplitPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorBids, setVendorBids] = useState<VendorBid[]>([])
  const [allocations, setAllocations] = useState<VendorAllocation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSplitting, setIsSplitting] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [orderRes, vendorsRes, bidsRes] = await Promise.all([
        fetch(`/api/orders/${orderId}`),
        fetch('/api/vendors?page_size=100'),
        fetch(`/api/vendors/bids?order_id=${orderId}`),
      ])

      if (orderRes.ok) {
        const orderData = await orderRes.json()
        setOrder(orderData)
      }

      if (vendorsRes.ok) {
        const vendorsData = await vendorsRes.json()
        setVendors(vendorsData.data || [])
      }

      if (bidsRes.ok) {
        const bidsData = await bidsRes.json()
        const bids = bidsData.data || bidsData || []
        setVendorBids(bids)

        // Pre-populate allocations from accepted vendor bids with proportional quantities
        const accepted = bids.filter(
          (b: VendorBid) => b.status === 'accepted' || (b as any).is_accepted
        )
        if (accepted.length >= 2 && orderRes.ok) {
          const orderData = await orderRes.json().catch(() => null)
          const items = orderData?.items || []
          const preAllocations = buildPrefilledAllocations(accepted, items)
          if (preAllocations.length > 0) {
            setAllocations(preAllocations)
          }
        } else if (accepted.length > 0) {
          // Just set vendor selections without quantities
          const preAllocations: VendorAllocation[] = accepted.map((bid: VendorBid) => ({
            vendor_id: bid.vendor_id,
            vendor_name: bid.vendor?.company_name || 'Unknown Vendor',
            items: {},
          }))
          setAllocations(preAllocations)
        }
      }
    } catch {
      toast.error('Failed to load order data')
    } finally {
      setIsLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchData() }, [fetchData])

  const addVendorAllocation = () => {
    setAllocations(prev => [
      ...prev,
      { vendor_id: '', vendor_name: '', items: {} },
    ])
  }

  const removeVendorAllocation = (index: number) => {
    setAllocations(prev => prev.filter((_, i) => i !== index))
  }

  const updateVendorSelection = (index: number, vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId)
    setAllocations(prev => prev.map((alloc, i) =>
      i === index
        ? { ...alloc, vendor_id: vendorId, vendor_name: vendor?.company_name || '' }
        : alloc
    ))
  }

  const updateItemQuantity = (allocIndex: number, itemId: string, qty: number) => {
    setAllocations(prev => prev.map((alloc, i) =>
      i === allocIndex
        ? { ...alloc, items: { ...alloc.items, [itemId]: Math.max(0, qty) } }
        : alloc
    ))
  }

  // Calculate remaining quantities
  const getRemainingQty = (itemId: string, parentQty: number): number => {
    const allocated = allocations.reduce(
      (sum, alloc) => sum + (alloc.items[itemId] || 0), 0
    )
    return parentQty - allocated
  }

  // Validation
  const getValidationErrors = (): string[] => {
    const errors: string[] = []
    if (allocations.length < 2) {
      errors.push('At least 2 vendor allocations required')
    }

    const vendorIds = allocations.map(a => a.vendor_id).filter(Boolean)
    if (new Set(vendorIds).size !== vendorIds.length) {
      errors.push('Each vendor can only appear once')
    }

    if (allocations.some(a => !a.vendor_id)) {
      errors.push('All allocations must have a vendor selected')
    }

    if (!order?.items) return errors

    for (const item of order.items) {
      const remaining = getRemainingQty(item.id, item.quantity)
      if (remaining !== 0) {
        const deviceName = item.device ? `${item.device.make} ${item.device.model}` : 'Unknown'
        errors.push(`${deviceName}: ${remaining > 0 ? `${remaining} unallocated` : `${Math.abs(remaining)} over-allocated`}`)
      }
    }

    // Check each allocation has at least 1 item with qty > 0
    for (let i = 0; i < allocations.length; i++) {
      const totalQty = Object.values(allocations[i].items).reduce((s, q) => s + q, 0)
      if (totalQty === 0) {
        errors.push(`Vendor ${i + 1} has no items allocated`)
      }
    }

    return errors
  }

  const handleSplit = async () => {
    const errors = getValidationErrors()
    if (errors.length > 0) {
      toast.error(errors[0])
      return
    }

    setIsSplitting(true)
    try {
      const body = {
        strategy: 'quantity' as const,
        allocations: allocations.map(alloc => ({
          vendor_id: alloc.vendor_id,
          items: Object.entries(alloc.items)
            .filter(([, qty]) => qty > 0)
            .map(([order_item_id, quantity]) => ({ order_item_id, quantity })),
        })),
      }

      const res = await fetch(`/api/orders/${orderId}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to split order')
      }

      const result = await res.json()
      toast.success(result.message || 'Order split successfully')
      router.push(`/orders/${orderId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to split order')
    } finally {
      setIsSplitting(false)
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

  if (order.status !== 'sourcing') {
    return (
      <div className="text-center py-20">
        <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          Order must be in &quot;sourcing&quot; status to split
        </p>
        <Link href={`/orders/${orderId}`}>
          <Button variant="outline" className="mt-4">Back to Order</Button>
        </Link>
      </div>
    )
  }

  const validationErrors = getValidationErrors()
  const isValid = validationErrors.length === 0

  // Filter out vendors already selected
  const selectedVendorIds = allocations.map(a => a.vendor_id).filter(Boolean)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/orders/${orderId}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Split Order {order.order_number}
          </h1>
          <p className="text-muted-foreground mt-1">
            Allocate items across multiple vendors
          </p>
        </div>
      </div>

      {/* Order Items Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Items</CardTitle>
          <CardDescription>Items to allocate across vendors</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Total Qty</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items?.map(item => {
                const remaining = getRemainingQty(item.id, item.quantity)
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.device ? `${item.device.make} ${item.device.model}` : 'Unknown'}
                      {item.device?.variant && <span className="text-muted-foreground ml-1">({item.device.variant})</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.claimed_condition || '—'}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.unit_price ? formatCurrency(item.unit_price) : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={remaining === 0 ? 'default' : remaining > 0 ? 'secondary' : 'destructive'}>
                        {remaining === 0 ? (
                          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Allocated</span>
                        ) : remaining > 0 ? (
                          `${remaining} left`
                        ) : (
                          `${Math.abs(remaining)} over`
                        )}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pre-filled banner */}
      {vendorBids.filter(b => b.status === 'accepted' || (b as any).is_accepted).length >= 2 && allocations.length >= 2 && (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20">
          <CardContent className="flex items-center gap-3 py-3">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm">
              Allocations pre-filled from accepted vendor bids. Review and adjust if needed.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Vendor Allocations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Vendor Allocations</h2>
          <div className="flex gap-2">
            {vendorBids.filter(b => b.status === 'accepted' || (b as any).is_accepted).length >= 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const accepted = vendorBids.filter(b => b.status === 'accepted' || (b as any).is_accepted)
                  if (order?.items) {
                    const prefilled = buildPrefilledAllocations(accepted, order.items)
                    if (prefilled.length > 0) {
                      setAllocations(prefilled)
                      toast.success('Allocations filled from vendor bids')
                    }
                  }
                }}
              >
                <Wand2 className="mr-2 h-4 w-4" /> Auto-Fill from Bids
              </Button>
            )}
            <Button onClick={addVendorAllocation} variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" /> Add Vendor
            </Button>
          </div>
        </div>

        {allocations.length === 0 && (
          <Card>
            <CardContent className="text-center py-10">
              <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                Add at least 2 vendors to start allocating items
              </p>
              <Button onClick={addVendorAllocation} className="mt-4" size="sm">
                <Plus className="mr-2 h-4 w-4" /> Add First Vendor
              </Button>
            </CardContent>
          </Card>
        )}

        {allocations.map((alloc, allocIndex) => {
          const suffix = String.fromCharCode(65 + allocIndex) // A, B, C...
          const allocTotal = Object.values(alloc.items).reduce((s, q) => s + q, 0)
          return (
            <Card key={allocIndex}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{order.order_number}-{suffix}</Badge>
                    <div className="w-[240px]">
                      <Select value={alloc.vendor_id} onValueChange={v => updateVendorSelection(allocIndex, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vendor" />
                        </SelectTrigger>
                        <SelectContent>
                          {vendors
                            .filter(v => v.is_active && (!selectedVendorIds.includes(v.id) || v.id === alloc.vendor_id))
                            .map(v => (
                              <SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <span className="text-sm text-muted-foreground">{allocTotal} units</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeVendorAllocation(allocIndex)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {order.items?.map(item => {
                    const deviceName = item.device ? `${item.device.make} ${item.device.model}` : 'Unknown'
                    return (
                      <div key={item.id} className="flex items-center gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{deviceName}</p>
                          <p className="text-xs text-muted-foreground">
                            Total: {item.quantity} | {item.unit_price ? formatCurrency(item.unit_price) + '/unit' : 'Unpriced'}
                          </p>
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={alloc.items[item.id] || ''}
                            placeholder="0"
                            onChange={e => updateItemQuantity(allocIndex, item.id, parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Validation & Execute */}
      {allocations.length >= 2 && (
        <Card>
          <CardContent className="py-4">
            {validationErrors.length > 0 ? (
              <div className="space-y-2">
                {validationErrors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {err}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                All items allocated correctly. Ready to split.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Link href={`/orders/${orderId}`}>
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button
          onClick={handleSplit}
          disabled={!isValid || isSplitting}
        >
          {isSplitting ? 'Splitting...' : `Split into ${allocations.length} Sub-Orders`}
        </Button>
      </div>
    </div>
  )
}
