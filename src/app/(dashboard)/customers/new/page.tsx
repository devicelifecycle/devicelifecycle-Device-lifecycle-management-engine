// ============================================================================
// CREATE CUSTOMER PAGE
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers } from '@/hooks/useCustomers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { Organization } from '@/types'

type CustomerCreateResult = {
  portal_account_created?: boolean
  welcome_email_sent_to?: string | null
  welcome_email_sent?: boolean
  portal_account_skipped_reason?: string | null
}

export default function NewCustomerPage() {
  const router = useRouter()
  const { create, isCreating } = useCustomers()
  const [customerOrgs, setCustomerOrgs] = useState<Organization[]>([])
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    payment_terms: '',
    notes: '',
    organization_id: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: '',
  })

  useEffect(() => {
    fetch('/api/organizations?type=customer&page_size=100')
      .then(res => res.ok ? res.json() : { data: [] })
      .then(json => setCustomerOrgs(json.data || []))
      .catch(() => setCustomerOrgs([]))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const hasAddress = form.street || form.city || form.state || form.zip || form.country
      const address = hasAddress ? { street: form.street, city: form.city, state: form.state, zip: form.zip, country: form.country } : undefined
      const { street: _s, city: _c, state: _st, zip: _z, country: _co, ...rest } = form
      const result = await create({
        ...rest,
        organization_id: form.organization_id || undefined,
        shipping_address: address,
        billing_address: address,
      }) as CustomerCreateResult

      if (result.portal_account_created && result.welcome_email_sent_to && result.welcome_email_sent) {
        toast.success(`Customer created and login details emailed to ${result.welcome_email_sent_to}`)
      } else if (result.portal_account_created && result.welcome_email_sent_to && result.welcome_email_sent === false) {
        toast.warning(`Customer created, but the welcome email could not be sent to ${result.welcome_email_sent_to}. Please retry or create the user manually.`)
      } else if (result.portal_account_skipped_reason) {
        toast.success(`Customer created. ${result.portal_account_skipped_reason}.`)
      } else {
        toast.success('Customer created successfully')
      }
      router.push('/customers')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create customer')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/customers">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Customer</h1>
          <p className="text-muted-foreground">Add a new customer to the system</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer Details</CardTitle>
          <CardDescription>Fill in the customer information below. A portal account and welcome email will be created automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {customerOrgs.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="organization_id">Link to existing organization</Label>
                <Select value={form.organization_id || '__new__'} onValueChange={v => {
                  const effectiveId = v === '__new__' ? '' : v
                  const org = customerOrgs.find(o => o.id === effectiveId)
                  setForm(f => ({
                    ...f,
                    organization_id: effectiveId,
                    ...(org && { company_name: org.name, contact_email: org.contact_email || f.contact_email, contact_phone: org.contact_phone || f.contact_phone }),
                  }))
                }}>
                  <SelectTrigger><SelectValue placeholder="Create new organization (default)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__">Create new organization</SelectItem>
                    {customerOrgs.map(org => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Select to reuse an existing customer organization, or leave empty to create one</p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name *</Label>
                <Input id="company_name" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_name">Contact Name *</Label>
                <Input id="contact_name" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact_email">Email *</Label>
                <Input id="contact_email" type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_phone">Mobile Number</Label>
                <Input id="contact_phone" type="tel" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+1 416 555 1234" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_terms">Payment Terms</Label>
              <Select value={form.payment_terms} onValueChange={v => setForm(f => ({ ...f, payment_terms: v }))}>
                <SelectTrigger><SelectValue placeholder="Select terms" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                  <SelectItem value="net_30">Net 30</SelectItem>
                  <SelectItem value="net_60">Net 60</SelectItem>
                  <SelectItem value="net_90">Net 90</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator className="my-2" />
            <p className="text-sm font-medium text-muted-foreground">Address (optional)</p>
            <div className="space-y-2">
              <Label htmlFor="street">Street</Label>
              <Input id="street" value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} placeholder="123 Main St" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State / Province</Label>
                <Input id="state" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP / Postal Code</Label>
                <Input id="zip" value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input id="country" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="Canada" />
              </div>
            </div>
            <Separator className="my-2" />
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Customer'}</Button>
              <Link href="/customers"><Button variant="outline" type="button">Cancel</Button></Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
