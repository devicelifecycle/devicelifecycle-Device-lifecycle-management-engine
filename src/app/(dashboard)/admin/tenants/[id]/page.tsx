'use client'

// ============================================================================
// ADMIN — TENANT DETAIL / BRANDING EDITOR
// ============================================================================
// Edit a VAR's branding, custom domain, and active status, with a live preview.

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_BRANDING, type TenantBranding } from '@/lib/branding'

interface TenantDetail {
  id: string
  name: string
  slug: string
  type: 'platform' | 'var'
  is_active: boolean
  custom_domain: string | null
  plan: string | null
  branding: TenantBranding
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING)
  const [customDomain, setCustomDomain] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${id}`)
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setTenant(data)
      setBranding(data.branding)
      setCustomDomain(data.custom_domain ?? '')
      setIsActive(data.is_active)
    } catch {
      toast.error('Failed to load tenant')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  const isPlatform = tenant?.type === 'platform'

  const set = <K extends keyof TenantBranding>(k: K, v: TenantBranding[K]) =>
    setBranding((b) => ({ ...b, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branding: isPlatform ? undefined : branding,
          is_active: isPlatform ? undefined : isActive,
          custom_domain: customDomain.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to save')
      toast.success('Branding saved')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tenant…
      </div>
    )
  }
  if (!tenant) {
    return <div className="p-8 text-sm text-muted-foreground">Tenant not found.</div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <button type="button" onClick={() => router.push('/admin/tenants')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All tenants
      </button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <span className="font-mono text-xs">{tenant.slug}</span> · {isPlatform ? 'Platform tenant' : 'VAR tenant'}
        </p>
      </div>

      {isPlatform && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This is the Byte-Back platform tenant. Its identity and status are locked; branding edits apply to VAR tenants only.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
            <CardDescription>Colors use HSL triplets (e.g. <span className="font-mono">221 83% 53%</span>).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Display name">
                <Input value={branding.name} disabled={isPlatform} onChange={(e) => set('name', e.target.value)} maxLength={120} />
              </Field>
              <Field label="Monogram">
                <Input value={branding.logoText} disabled={isPlatform} onChange={(e) => set('logoText', e.target.value.toUpperCase())} maxLength={6} />
              </Field>
              <Field label="Primary (HSL)">
                <Input value={branding.primary} disabled={isPlatform} onChange={(e) => set('primary', e.target.value)} placeholder="221 83% 53%" />
              </Field>
              <Field label="Sidebar (HSL)">
                <Input value={branding.sidebarBg} disabled={isPlatform} onChange={(e) => set('sidebarBg', e.target.value)} placeholder="222 47% 13%" />
              </Field>
              <Field label="Support email">
                <Input value={branding.supportEmail ?? ''} disabled={isPlatform} onChange={(e) => set('supportEmail', e.target.value || null)} placeholder="support@acme.com" />
              </Field>
              <Field label="Custom domain">
                <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="portal.acme.com" />
              </Field>
            </div>
            <Field label="Tagline">
              <Input value={branding.tagline} disabled={isPlatform} onChange={(e) => set('tagline', e.target.value)} maxLength={160} />
            </Field>

            {!isPlatform && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">Inactive VARs cannot sign in.</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}

            <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save branding
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>How the identity renders.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border">
              <div className="flex items-center gap-3 p-4" style={{ background: `hsl(${branding.sidebarBg})` }}>
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ background: `hsl(${branding.primary})` }}
                >
                  {branding.logoText}
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-white">{branding.name}</p>
                  <p className="text-[10px] text-white/60">{branding.tagline}</p>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div className="h-2 w-3/4 rounded-full bg-muted" />
                <div className="h-2 w-1/2 rounded-full bg-muted" />
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
                  style={{ background: `hsl(${branding.primary})` }}
                >
                  Primary action
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
