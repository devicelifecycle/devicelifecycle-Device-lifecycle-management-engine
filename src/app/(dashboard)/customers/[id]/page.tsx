// ============================================================================
// CUSTOMER DETAIL PAGE
// ============================================================================

'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil, X, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomer } from '@/hooks/useCustomers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatDate } from '@/lib/utils'

export default function CustomerDetailPage() {
  const params = useParams()
  const { customer, isLoading, update, isUpdating } = useCustomer(params.id as string)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})

  const startEditing = () => {
    if (!customer) return
    setForm({
      company_name: customer.company_name || '',
      contact_name: customer.contact_name || '',
      contact_email: customer.contact_email || '',
      contact_phone: customer.contact_phone || '',
      notes: customer.notes || '',
    })
    setEditing(true)
  }

  const handleSave = async () => {
    try {
      await update(form)
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
    <div className="mx-auto max-w-2xl space-y-6">
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
        </div>
      </div>

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
                  <Label>Phone</Label>
                  <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                </div>
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
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{customer.contact_phone || '—'}</p>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
