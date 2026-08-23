'use client'

// ============================================================================
// END CUSTOMER CONSOLE — Company Profile
// ============================================================================
// Website, industry, business hours, and repeatable lists of locations,
// departments, and contacts. Backed by customers.company_profile (JSONB) via
// GET/PATCH /api/customer/profile — already tenant-scoped and sanitized server-side.

import { useEffect, useState } from 'react'
import { Building2, Plus, Trash2, Loader2, MapPin, Users2, Contact as ContactIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ComingSoon } from '@/components/ComingSoon'
import { useMyCustomer } from '@/hooks/useCustomers'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { EMPTY_COMPANY_PROFILE, type CompanyProfile, type Location, type Contact } from '@/lib/company-profile'

export default function CustomerCompanyProfilePage() {
  return <ComingSoon title="Company Profile" />
}

function CustomerCompanyProfilePageImpl() {
  const { customer, isLoading: loadingCustomer } = useMyCustomer()
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_COMPANY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!customer?.id) return
    fetch(`/api/customer/profile?customer_id=${customer.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: { profile?: CompanyProfile } } | null) => d?.data?.profile && setProfile(d.data.profile))
      .catch(() => toast.error('Could not load company profile'))
      .finally(() => setLoading(false))
  }, [customer?.id])

  const save = async () => {
    if (!customer?.id) return
    setSaving(true)
    try {
      const res = await fetch('/api/customer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customer.id, profile }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Could not save'); return }
      setProfile(data.data.profile)
      toast.success('Company profile saved')
    } catch {
      toast.error('Could not save company profile')
    } finally {
      setSaving(false)
    }
  }

  if (loadingCustomer || loading) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Building2 className="h-6 w-6 text-primary" /> Company Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">{customer?.company_name || 'Your organization'} — website, hours, locations, departments, and contacts.</p>
        </div>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Company details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Website</Label>
            <Input value={profile.website ?? ''} onChange={(e) => setProfile((p) => ({ ...p, website: e.target.value || null }))} placeholder="https://example.com" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Industry</Label>
            <Input value={profile.industry ?? ''} onChange={(e) => setProfile((p) => ({ ...p, industry: e.target.value || null }))} placeholder="Telecom, Retail, …" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Business hours</Label>
            <Textarea rows={2} value={profile.businessHours ?? ''} onChange={(e) => setProfile((p) => ({ ...p, businessHours: e.target.value || null }))} placeholder="Mon–Fri 9am–5pm ET" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4" /> Locations</CardTitle>
          <CardDescription>Sites this order/trade-in traffic may ship from or reference.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.locations.map((loc, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Name (e.g. HQ, Warehouse A)" value={loc.name} onChange={(e) => updateAt(setProfile, 'locations', i, { ...loc, name: e.target.value })} />
                <Input placeholder="City" value={loc.city} onChange={(e) => updateAt(setProfile, 'locations', i, { ...loc, city: e.target.value })} />
                <Input placeholder="Address" className="sm:col-span-2" value={loc.address} onChange={(e) => updateAt(setProfile, 'locations', i, { ...loc, address: e.target.value })} />
                <Input placeholder="Province/State" value={loc.province} onChange={(e) => updateAt(setProfile, 'locations', i, { ...loc, province: e.target.value })} />
                <Input placeholder="Country" value={loc.country} onChange={(e) => updateAt(setProfile, 'locations', i, { ...loc, country: e.target.value })} />
              </div>
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeAt(setProfile, 'locations', i)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => addItem(setProfile, 'locations', { name: '', address: '', city: '', province: '', country: '' } satisfies Location)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add location
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Users2 className="h-4 w-4" /> Departments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {profile.departments.map((dept, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-sm">
                {dept}
                <button type="button" onClick={() => removeAt(setProfile, 'departments', i)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
            {profile.departments.length === 0 && <p className="text-sm text-muted-foreground">No departments added yet.</p>}
          </div>
          <DeptAdder onAdd={(name) => addItem(setProfile, 'departments', name)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ContactIcon className="h-4 w-4" /> Contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.contacts.map((c, i) => (
            <div key={i}>
              {i > 0 && <Separator className="my-3" />}
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Name" value={c.name} onChange={(e) => updateAt(setProfile, 'contacts', i, { ...c, name: e.target.value })} />
                <Input placeholder="Role" value={c.role} onChange={(e) => updateAt(setProfile, 'contacts', i, { ...c, role: e.target.value })} />
                <Input placeholder="Email" type="email" value={c.email} onChange={(e) => updateAt(setProfile, 'contacts', i, { ...c, email: e.target.value })} />
                <Input placeholder="Phone" value={c.phone} onChange={(e) => updateAt(setProfile, 'contacts', i, { ...c, phone: e.target.value })} />
              </div>
              <Button type="button" variant="ghost" size="sm" className="mt-1 text-destructive" onClick={() => removeAt(setProfile, 'contacts', i)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => addItem(setProfile, 'contacts', { name: '', email: '', phone: '', role: '' } satisfies Contact)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add contact
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function DeptAdder({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState('')
  const submit = () => { const v = value.trim(); if (v) { onAdd(v); setValue('') } }
  return (
    <div className="flex gap-2">
      <Input placeholder="Add a department…" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())} />
      <Button type="button" variant="outline" size="sm" onClick={submit}><Plus className="h-3.5 w-3.5" /></Button>
    </div>
  )
}

// Small generic list helpers — keep the repeated add/update/remove logic in one place.
function addItem<K extends 'locations' | 'departments' | 'contacts'>(
  setProfile: React.Dispatch<React.SetStateAction<CompanyProfile>>, key: K, item: CompanyProfile[K][number],
) {
  setProfile((p) => ({ ...p, [key]: [...p[key], item] }))
}
function updateAt<K extends 'locations' | 'departments' | 'contacts'>(
  setProfile: React.Dispatch<React.SetStateAction<CompanyProfile>>, key: K, index: number, item: CompanyProfile[K][number],
) {
  setProfile((p) => ({ ...p, [key]: p[key].map((existing, i) => (i === index ? item : existing)) }))
}
function removeAt<K extends 'locations' | 'departments' | 'contacts'>(
  setProfile: React.Dispatch<React.SetStateAction<CompanyProfile>>, key: K, index: number,
) {
  setProfile((p) => ({ ...p, [key]: p[key].filter((_, i) => i !== index) }))
}
