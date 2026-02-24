// ============================================================================
// CREATE VENDOR PAGE
// ============================================================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useVendors } from '@/hooks/useVendors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

export default function NewVendorPage() {
  const router = useRouter()
  const { create, isCreating } = useVendors()
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    payment_terms: '',
    warranty_period_days: '',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await create({
        ...form,
        warranty_period_days: form.warranty_period_days ? Number(form.warranty_period_days) : undefined,
      })
      toast.success('Vendor created successfully')
      router.push('/vendors')
    } catch {
      toast.error('Failed to create vendor')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/vendors"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">New Vendor</h1>
          <p className="text-muted-foreground">Add a new vendor to the system</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vendor Details</CardTitle>
          <CardDescription>Fill in the vendor information below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                <Label htmlFor="contact_phone">Phone</Label>
                <Input id="contact_phone" type="tel" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="space-y-2">
                <Label htmlFor="warranty_period_days">Warranty Period (days)</Label>
                <Input id="warranty_period_days" type="number" value={form.warranty_period_days} onChange={e => setForm(f => ({ ...f, warranty_period_days: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Vendor'}</Button>
              <Link href="/vendors"><Button variant="outline" type="button">Cancel</Button></Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
