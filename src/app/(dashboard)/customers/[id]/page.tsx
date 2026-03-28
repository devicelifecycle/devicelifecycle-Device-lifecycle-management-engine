// ============================================================================
// CUSTOMER DETAIL PAGE
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil, X, Save, Trash2, ShoppingCart, MapPin, Building2, Bell, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomer } from '@/hooks/useCustomers'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
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
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'
import { formatDate, formatAddress, formatCurrency } from '@/lib/utils'
import type { Order } from '@/types'

export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { customer, isLoading, update, isUpdating, remove, isDeleting } = useCustomer(params.id as string)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const canDelete = user?.role === 'admin' || user?.role === 'coe_manager'

  useEffect(() => {
    if (!params.id) return
    setOrdersLoading(true)
    fetch(`/api/customers/${params.id}/orders?limit=50`)
      .then(res => res.ok ? res.json() : { data: [] })
      .then(json => { setOrders(json.data || []) })
      .finally(() => setOrdersLoading(false))
  }, [params.id])

  const handleDelete = async () => {
    try {
      await remove()
      toast.success('Customer deleted')
      router.push('/customers')
    } catch {
      toast.error('Failed to delete customer')
    } finally {
      setDeleteDialogOpen(false)
    }
  }

  const startEditing = () => {
    if (!customer) return
    setForm({
      company_name: customer.company_name || '',
      contact_name: customer.contact_name || '',
      contact_email: customer.contact_email || '',
      contact_phone: customer.contact_phone || '',
      notes: customer.notes || '',
      default_risk_mode: customer.default_risk_mode || '',
    })
    setEditing(true)
  }

  const handleSave = async () => {
    try {
      const payload = { ...form }
      if (payload.default_risk_mode === '') delete payload.default_risk_mode
      await update(payload)
      toast.success('Customer updated successfully')
      setEditing(false)
    } catch {
      toast.error('Failed to update customer')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Customer not found</p>
        <Link href="/customers"><Button variant="outline" className="mt-4">Back to Customers</Button></Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/customers"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">{customer.company_name}</h1>
            <p className="text-muted-foreground">Customer since {formatDate(customer.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={customer.is_active ? 'default' : 'secondary'}>{customer.is_active ? 'Active' : 'Inactive'}</Badge>
          {!editing && <Button variant="outline" size="sm" onClick={startEditing}><Pencil className="mr-2 h-3 w-3" />Edit</Button>}
          {canDelete && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="mr-2 h-3 w-3" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {(customer as { organization?: { id: string; name: string } }).organization && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />Organization</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">This customer is linked to organization</p>
            <Link href="/admin/organizations" className="font-medium text-primary hover:underline">
              {(customer as { organization?: { name: string } }).organization?.name}
            </Link>
          </CardContent>
        </Card>
      )}

      {customer.company_name?.toLowerCase().includes('acme') && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader><CardTitle className="text-base">Verify customer view (exception flow)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              To confirm this customer sees notifications and order details for triage exceptions:
            </p>
            <ol className="text-sm list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Log out, then log in as <strong className="text-foreground">acme</strong> / <strong className="text-foreground">Test123!</strong></li>
              <li>Go to <Link href="/notifications" className="font-medium text-primary hover:underline">Notifications</Link> — exception updates appear here</li>
              <li>Go to <Link href="/customer/orders" className="font-medium text-primary hover:underline">My Orders</Link> — click any order to see full details including triage/exception info</li>
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Mobile Number</Label>
                  <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+1 416 555 1234" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Default Risk Mode (Pricing)</Label>
                <Select value={form.default_risk_mode || 'retail'} onValueChange={v => setForm(f => ({ ...f, default_risk_mode: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">Retail (20% margin)</SelectItem>
                    <SelectItem value="enterprise">Enterprise (12% margin)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Used when suggesting prices for this customer&apos;s orders</p>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={isUpdating}><Save className="mr-2 h-3 w-3" />{isUpdating ? 'Saving...' : 'Save'}</Button>
                <Button variant="outline" onClick={() => setEditing(false)}><X className="mr-2 h-3 w-3" />Cancel</Button>
              </div>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Company Name</p>
                <p className="font-medium">{customer.company_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Contact Name</p>
                <p className="font-medium">{customer.contact_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{customer.contact_email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mobile</p>
                <p className="font-medium">{customer.contact_phone || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Default Risk Mode (Pricing)</p>
                <p className="font-medium capitalize">{customer.default_risk_mode || 'Retail'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payment Terms</p>
                <p className="font-medium">{customer.payment_terms || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Credit Limit</p>
                <p className="font-medium">{customer.credit_limit ? `$${customer.credit_limit.toLocaleString()}` : '—'}</p>
              </div>
              {customer.notes && (
                <div className="sm:col-span-2">
                  <Separator className="mb-3" />
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{customer.notes}</p>
                </div>
              )}
              <div className="sm:col-span-2"><p className="text-sm text-muted-foreground">Created</p><p className="font-medium">{formatDate(customer.created_at)}</p></div>
              <div className="sm:col-span-2"><p className="text-sm text-muted-foreground">Last Updated</p><p className="font-medium">{formatDate(customer.updated_at)}</p></div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Addresses */}
      {(customer.billing_address || customer.shipping_address) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {customer.billing_address && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Billing Address</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{formatAddress(customer.billing_address as Record<string, unknown>)}</p></CardContent>
            </Card>
          )}
          {customer.shipping_address && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Shipping Address</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{formatAddress(customer.shipping_address as Record<string, unknown>)}</p></CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Order Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Order Activity</CardTitle>
          <Link href={`/orders?customer_id=${customer.id}`}><Button variant="outline" size="sm">View all orders</Button></Link>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="py-8 text-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" /></div>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No orders yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
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
                    return (
                      <TableRow key={o.id}>
                        <TableCell><Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.order_number}</Link></TableCell>
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate <strong>{customer?.company_name}</strong>. They will no longer appear in the active customers list. This cannot be undone easily.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
