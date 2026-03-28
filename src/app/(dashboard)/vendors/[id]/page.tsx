// ============================================================================
// VENDOR DETAIL PAGE
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil, X, Save, ShoppingCart, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useVendor } from '@/hooks/useVendors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import { formatDate, formatAddress, formatCurrency } from '@/lib/utils'
import type { Order } from '@/types'

export default function VendorDetailPage() {
  const params = useParams()
  const { vendor, isLoading, update, isUpdating } = useVendor(params.id as string)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  useEffect(() => {
    if (!params.id) return
    setOrdersLoading(true)
    fetch(`/api/vendors/${params.id}/orders?limit=50`)
      .then(res => res.ok ? res.json() : { data: [] })
      .then(json => { setOrders(json.data || []) })
      .finally(() => setOrdersLoading(false))
  }, [params.id])

  const startEditing = () => {
    if (!vendor) return
    const addr = (vendor.address || {}) as Record<string, string>
    setForm({
      company_name: vendor.company_name || '',
      contact_name: vendor.contact_name || '',
      contact_email: vendor.contact_email || '',
      contact_phone: vendor.contact_phone || '',
      notes: vendor.notes || '',
      street: addr.street || '',
      city: addr.city || '',
      state: addr.state || '',
      zip: addr.zip || '',
      country: addr.country || '',
    })
    setEditing(true)
  }

  const handleSave = async () => {
    try {
      const { street, city, state, zip, country, ...rest } = form
      await update({
        ...rest,
        address: { street, city, state, zip, country },
      })
      toast.success('Vendor updated successfully')
      setEditing(false)
    } catch {
      toast.error('Failed to update vendor')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Vendor not found</p>
        <Link href="/vendors"><Button variant="outline" className="mt-4">Back to Vendors</Button></Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/vendors"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">{vendor.company_name}</h1>
            <p className="text-muted-foreground">Vendor since {formatDate(vendor.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={vendor.is_active ? 'default' : 'secondary'}>{vendor.is_active ? 'Active' : 'Inactive'}</Badge>
          {!editing && <Button variant="outline" size="sm" onClick={startEditing}><Pencil className="mr-2 h-3 w-3" />Edit</Button>}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Vendor Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Company Name</Label><Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} /></div>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={isUpdating}><Save className="mr-2 h-3 w-3" />{isUpdating ? 'Saving...' : 'Save'}</Button>
                <Button variant="outline" onClick={() => setEditing(false)}><X className="mr-2 h-3 w-3" />Cancel</Button>
              </div>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-sm text-muted-foreground">Company Name</p><p className="font-medium">{vendor.company_name}</p></div>
              <div><p className="text-sm text-muted-foreground">Contact Name</p><p className="font-medium">{vendor.contact_name}</p></div>
              <div><p className="text-sm text-muted-foreground">Email</p><p className="font-medium">{vendor.contact_email}</p></div>
              <div><p className="text-sm text-muted-foreground">Phone</p><p className="font-medium">{vendor.contact_phone || '—'}</p></div>
              <div><p className="text-sm text-muted-foreground">Payment Terms</p><p className="font-medium">{vendor.payment_terms || '—'}</p></div>
              <div><p className="text-sm text-muted-foreground">Rating</p><p className="font-medium">{vendor.rating ? `${vendor.rating}/5` : '—'}</p></div>
              <div><p className="text-sm text-muted-foreground">Warranty Period</p><p className="font-medium">{vendor.warranty_period_days ? `${vendor.warranty_period_days} days` : '—'}</p></div>
              <div><p className="text-sm text-muted-foreground">Created</p><p className="font-medium">{formatDate(vendor.created_at)}</p></div>
              <div><p className="text-sm text-muted-foreground">Last Updated</p><p className="font-medium">{formatDate(vendor.updated_at)}</p></div>
              {vendor.notes && (
                <div className="sm:col-span-2"><Separator className="mb-3" /><p className="text-sm text-muted-foreground">Notes</p><p className="text-sm">{vendor.notes}</p></div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Address card if present */}
      {vendor.address && Object.keys(vendor.address as object).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Address</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{formatAddress(vendor.address as Record<string, unknown>)}</p></CardContent>
        </Card>
      )}

      {/* Order Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Order Activity</CardTitle>
          <Link href={`/orders?vendor_id=${vendor.id}`}><Button variant="outline" size="sm">View all orders</Button></Link>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="py-8 text-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" /></div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No orders assigned yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const statusConfig = ORDER_STATUS_CONFIG[o.status as keyof typeof ORDER_STATUS_CONFIG]
                    const customer = (o as Order & { customer?: { company_name?: string } }).customer
                    return (
                      <TableRow key={o.id}>
                        <TableCell><Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.order_number}</Link></TableCell>
                        <TableCell>{customer?.company_name || '—'}</TableCell>
                        <TableCell className="capitalize">{o.type?.replace('_', ' ')}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{statusConfig?.label || o.status}</Badge></TableCell>
                        <TableCell className="text-right">{o.total_quantity}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(o.total_amount)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatDate(o.created_at)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
