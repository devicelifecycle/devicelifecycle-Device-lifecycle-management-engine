'use client'

// ============================================================================
// ADMIN — VARs (TENANTS)
// ============================================================================
// View and create VAR tenants. Existing data stays on the Byte-Back platform
// tenant; a new VAR is just a new row.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Building2, Loader2, Plus, ShieldCheck } from 'lucide-react'
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
  const [creating, setCreating] = useState(false)

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
    setCreating(true)
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() || undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to create VAR')
      toast.success(`VAR "${j.data.name}" created`)
      setName(''); setSlug('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create VAR')
    } finally {
      setCreating(false)
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
          <CardDescription>Provisions a new reseller tenant. The slug becomes its identifier (auto-generated if left blank).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="var-name">Name</Label>
              <Input id="var-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Wireless" maxLength={255} />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="var-slug">Slug <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="var-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="acme-wireless" maxLength={100} />
            </div>
            <Button type="submit" disabled={creating} className="sm:w-auto">
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
            <p className="py-8 text-center text-sm text-muted-foreground">No tenants yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Slug</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Created</th>
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
                      <td className="py-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
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
