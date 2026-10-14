'use client'

// ============================================================================
// ADMIN — VARs (TENANTS)
// ============================================================================
// View and create VAR tenants. Existing data stays on the Byte-Back platform
// tenant; a new VAR is just a new row.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Building2, Loader2, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'


interface Tenant {
  id: string
  parent_tenant_id: string | null
  name: string
  slug: string
  type: 'platform' | 'var'
  is_active: boolean
  custom_domain: string | null
  plan: string | null
  created_at: string
}

export default function TenantsPageImpl() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tenants?limit=200')
      if (!res.ok) throw new Error()
      const j = await res.json()
      setTenants(j.data ?? [])
    } catch {
      toast.error('Failed to load tenants')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) { toast.error('Name must be at least 2 characters'); return }
    if (adminEmail.trim() && adminName.trim().length < 2) { toast.error('Admin name must be at least 2 characters'); return }
    if (adminName.trim() && !adminEmail.trim()) { toast.error('Enter an email for the first administrator'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          admin_name: adminName.trim() || undefined,
          admin_email: adminEmail.trim() || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to create VAR')

      if (j.adminError) {
        toast.error(`VAR created but admin failed: ${j.adminError}`, { duration: 10000 })
      } else if (j.admin?.emailSent) {
        toast.success(`VAR "${j.data.name}" created — login details emailed to ${j.admin.emailSentTo}`)
      } else if (j.admin?.tempPassword) {
        toast.success(`VAR "${j.data.name}" created — temp password: ${j.admin.tempPassword}`, { duration: Infinity })
      } else {
        toast.success(`VAR "${j.data.name}" created`)
      }
      setName(''); setSlug(''); setAdminName(''); setAdminEmail('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create VAR')
    } finally {
      setCreating(false)
    }
  }

  const deleteTenant = async (t: Tenant) => {
    if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return
    setDeletingId(t.id)
    try {
      const res = await fetch(`/api/admin/tenants/${t.id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to delete')
      toast.success(`"${t.name}" deleted`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Building2 className="h-6 w-6 text-primary" /> VARs (Tenants)
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Value-Added Reseller tenants on the Byte-Back platform. Creating a VAR is additive —
          existing customers, orders, and data remain on the platform tenant.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Create a VAR</CardTitle>
          <CardDescription>Provisions a new reseller tenant with its first administrator. The admin gets a welcome email with login credentials.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="var-name">VAR name</Label>
                <Input id="var-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Wireless" maxLength={255} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="var-slug">Slug <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="var-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="acme-wireless" maxLength={100} />
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <UserPlus className="h-3.5 w-3.5" /> First administrator
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-name">Admin name</Label>
                  <Input id="admin-name" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Jordan Lee" maxLength={120} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-email">Admin email</Label>
                  <Input id="admin-email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="jordan@acme.com" maxLength={200} />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A welcome email with a temporary password will be sent to this address. You can also add more administrators later from the VAR detail page.
              </p>
            </div>
            <Button type="submit" disabled={creating} className="w-full sm:w-auto">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create VAR
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All tenants</CardTitle>
          <CardDescription>{loading ? 'Loading…' : `${tenants.length} tenant${tenants.length === 1 ? '' : 's'}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tenants…
            </div>
          ) : tenants.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium">No VARs yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                A VAR is a reseller with its own branded portal, its own customers and its own team, fully isolated from every other VAR. Creating one is additive &mdash; existing customers, orders and data stay on the platform tenant.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Slug</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                    <th className="pb-2 font-medium sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-3 pr-4 font-medium">
                        <Link href={`/admin/tenants/${t.id}`} className="hover:underline">{t.name}</Link>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{t.slug}</td>
                      <td className="py-3 pr-4">
                        {t.type === 'platform' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            <ShieldCheck className="h-3 w-3" /> Platform
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                            <Building2 className="h-3 w-3" /> VAR
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="py-3">
                        {t.type !== 'platform' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            disabled={deletingId === t.id}
                            onClick={() => deleteTenant(t)}
                          >
                            {deletingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
