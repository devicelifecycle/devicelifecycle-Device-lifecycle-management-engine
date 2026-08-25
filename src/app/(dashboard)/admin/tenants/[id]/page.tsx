'use client'

// ============================================================================
// ADMIN — TENANT DETAIL / BRANDING EDITOR
// ============================================================================
// Edit a VAR's branding, custom domain, and active status, with a live preview.

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save, Trash2, Upload } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_BRANDING, type TenantBranding } from '@/lib/branding'
import { DEFAULT_FEATURES, FEATURE_KEYS, type FeatureFlags, type FeatureKey } from '@/lib/features'
import { DEFAULT_LICENSE, LIMIT_KEYS, UNLIMITED, type LicenseLimits, type LimitKey } from '@/lib/licensing'
import { DEFAULT_WHITELABEL, type WhiteLabelContent } from '@/lib/templates'
import { Textarea } from '@/components/ui/textarea'

interface TenantDetail {
  id: string
  name: string
  slug: string
  type: 'platform' | 'var'
  is_active: boolean
  custom_domain: string | null
  plan: string | null
  branding: TenantBranding
  features: FeatureFlags
  license: LicenseLimits
  whitelabel: WhiteLabelContent
}

const FEATURE_LABELS: Record<FeatureKey, string> = {
  trade_in: 'Trade-in', cpo: 'CPO', rve: 'Residual value (RVE)',
  billing: 'Billing', reporting: 'Reporting', notifications: 'Notifications',
  api_access: 'API access', sso: 'SSO', vendor_auction: 'Vendor auction',
  knowledge_base: 'Knowledge base', chat: 'Chat', impersonation: 'Impersonation',
}
const LIMIT_LABELS: Record<LimitKey, string> = {
  customers: 'Customers', users: 'Users', storageMb: 'Storage (MB)',
  apiCallsPerMonth: 'API calls / mo', transactionsPerMonth: 'Transactions / mo',
}


export default function TenantDetailPageImpl() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING)
  const [features, setFeatures] = useState<FeatureFlags>(DEFAULT_FEATURES)
  const [license, setLicense] = useState<LicenseLimits>(DEFAULT_LICENSE)
  const [whitelabel, setWhitelabel] = useState<WhiteLabelContent>(DEFAULT_WHITELABEL)
  const [customDomain, setCustomDomain] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoBusy, setLogoBusy] = useState<'upload' | 'remove' | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${id}`)
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setTenant(data)
      setBranding(data.branding)
      setFeatures(data.features)
      setLicense(data.license)
      if (data.whitelabel) setWhitelabel(data.whitelabel)
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


  const uploadLogo = async () => {
    if (!logoFile) return
    setLogoBusy('upload')
    try {
      const fd = new FormData()
      fd.append('file', logoFile)
      const res = await fetch(`/api/admin/tenants/${id}/logo`, { method: 'POST', body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Logo upload failed')
      set('logoUrl', j.logoUrl as string)
      setLogoFile(null)
      toast.success('Logo uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Logo upload failed')
    } finally {
      setLogoBusy(null)
    }
  }

  const removeLogo = async () => {
    if (!window.confirm('Remove the tenant logo?')) return
    setLogoBusy('remove')
    try {
      const res = await fetch(`/api/admin/tenants/${id}/logo`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to remove logo')
      set('logoUrl', null)
      setLogoFile(null)
      toast.success('Logo removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove logo')
    } finally {
      setLogoBusy(null)
    }
  }

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
          features,
          license,
          whitelabel,
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
              <Field label="Secondary color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Secondary color"
                    value={hslTripletToHex(branding.secondaryColor ?? DEFAULT_SECONDARY_FALLBACK)}
                    disabled={isPlatform}
                    onChange={(e) => set('secondaryColor', hexToHslTriplet(e.target.value))}
                    className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
                  />
                  <span className="font-mono text-xs text-muted-foreground">{branding.secondaryColor ?? DEFAULT_SECONDARY_FALLBACK}</span>
                </div>
              </Field>
              <Field label="Support email">
                <Input value={branding.supportEmail ?? ''} disabled={isPlatform} onChange={(e) => set('supportEmail', e.target.value || null)} placeholder="support@acme.com" />
              </Field>
              <Field label="Custom domain">
                <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="portal.acme.com" />
              </Field>
              <Field label="Support phone">
                <Input
                  value={branding.supportPhone ?? ''}
                  disabled={isPlatform}
                  maxLength={24}
                  placeholder="+1 (555) 010-2030"
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d\s()+-]/g, '').slice(0, 24)
                    set('supportPhone', v === '' ? null : v)
                  }}
                />
              </Field>
              <Field label="Help URL">
                <Input
                  value={branding.helpUrl ?? ''}
                  disabled={isPlatform}
                  maxLength={500}
                  placeholder="https://help.acme.com"
                  onChange={(e) => set('helpUrl', e.target.value === '' ? null : e.target.value)}
                />
                {(branding.helpUrl ?? '') !== '' && !/^https?:\/\/\S+$/i.test(branding.helpUrl ?? '') && (
                  <p className="text-xs text-destructive">Must be an http(s) URL or empty.</p>
                )}
              </Field>
            </div>
            <Field label="Tagline">
              <Input value={branding.tagline} disabled={isPlatform} onChange={(e) => set('tagline', e.target.value)} maxLength={160} />
            </Field>
            <Field label="Logo">
              <div className="flex flex-wrap items-center gap-3">
                {branding.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={branding.logoUrl} alt="Tenant logo" className="h-10 w-10 rounded-lg border object-contain" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed text-xs font-bold text-muted-foreground">{branding.logoText}</div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={isPlatform || logoBusy !== null}
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  className="max-w-[240px] text-sm text-muted-foreground"
                />
                <Button type="button" variant="outline" size="sm" disabled={isPlatform || !logoFile || logoBusy !== null} onClick={uploadLogo}>
                  {logoBusy === 'upload' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={isPlatform || !branding.logoUrl || logoBusy !== null} onClick={removeLogo}>
                  {logoBusy === 'remove' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Remove
                </Button>
              </div>
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Features</CardTitle>
            <CardDescription>Enable or disable modules for this tenant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {FEATURE_KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-sm">{FEATURE_LABELS[k]}</span>
                <Switch checked={features[k]} onCheckedChange={(v) => setFeatures((f) => ({ ...f, [k]: v }))} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Licensing / quotas</CardTitle>
            <CardDescription>Blank = unlimited.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {LIMIT_KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <span className="text-sm">{LIMIT_LABELS[k]}</span>
                <Input
                  type="number"
                  min={0}
                  className="w-36"
                  placeholder="Unlimited"
                  value={license[k] === UNLIMITED ? '' : license[k]}
                  onChange={(e) => setLicense((l) => ({ ...l, [k]: e.target.value === '' ? UNLIMITED : Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                />
              </div>
            ))}
            <Button onClick={save} disabled={saving} className="mt-2 w-full sm:w-auto">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save features & limits
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">White-label content</CardTitle>
          <CardDescription>Email/notification copy + links. Tokens: <span className="font-mono">{'{{company}}'}</span>, <span className="font-mono">{'{{customer}}'}</span>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quote email subject">
              <Input value={whitelabel.quoteSubject} onChange={(e) => setWhitelabel((w) => ({ ...w, quoteSubject: e.target.value }))} maxLength={200} />
            </Field>
            <Field label="Notification signature">
              <Input value={whitelabel.notificationSignature} onChange={(e) => setWhitelabel((w) => ({ ...w, notificationSignature: e.target.value }))} maxLength={200} />
            </Field>
            <Field label="Knowledge base URL">
              <Input value={whitelabel.knowledgeBaseUrl ?? ''} onChange={(e) => setWhitelabel((w) => ({ ...w, knowledgeBaseUrl: e.target.value || null }))} placeholder="https://kb.acme.com" />
            </Field>
            <Field label="Privacy policy URL">
              <Input value={whitelabel.privacyPolicyUrl ?? ''} onChange={(e) => setWhitelabel((w) => ({ ...w, privacyPolicyUrl: e.target.value || null }))} placeholder="https://acme.com/privacy" />
            </Field>
          </div>
          <Field label="Quote email intro">
            <Textarea value={whitelabel.quoteIntro} onChange={(e) => setWhitelabel((w) => ({ ...w, quoteIntro: e.target.value }))} rows={3} maxLength={1000} />
          </Field>
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save white-label content
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

const DEFAULT_SECONDARY_FALLBACK = '221 83% 41%'

/** "221 83% 41%" -> "#1d4ed8" for <input type="color">. */
function hslTripletToHex(triplet: string): string {
  const m = /^(\d{1,3})\s+(\d{1,3})%\s+(\d{1,3})%$/.exec(triplet.trim())
  if (!m) return hslTripletToHex(DEFAULT_SECONDARY_FALLBACK)
  const h = Number(m[1]) % 360
  const s = Math.min(100, Number(m[2])) / 100
  const l = Math.min(100, Number(m[3])) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const off = l - c / 2
  let rgb: [number, number, number] = [0, 0, 0]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const toHex = (v: number) => Math.round((v + off) * 255).toString(16).padStart(2, '0')
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`
}

/** "#1d4ed8" -> "221 83% 41%" stored HSL-triplet format. */
function hexToHslTriplet(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return DEFAULT_SECONDARY_FALLBACK
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
    if (h < 0) h += 360
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
