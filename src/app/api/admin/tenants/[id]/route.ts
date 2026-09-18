// ============================================================================
// ADMIN TENANT DETAIL API — get / update a single tenant (branding, status)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveBranding } from '@/lib/branding'
import { resolveFeatures, FEATURE_KEYS } from '@/lib/features'
import { resolveLicense, LIMIT_KEYS } from '@/lib/licensing'
import { resolveWhiteLabel } from '@/lib/templates'
import { resolveRetentionPolicy, RETENTION_KEYS, RETENTION_MIN_DAYS, RETENTION_MAX_DAYS } from '@/lib/retention'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const PLATFORM_TENANT_ID = 'a0000000-0000-4000-a000-0000000000bb'
const hsl = z.string().regex(/^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/, 'HSL triplet like "221 83% 53%"')

// IPv4 address or CIDR range only — that is exactly what network.ts's
// ipInAllowlist parses. An entry it cannot parse silently matches nothing,
// which for an *allowlist* means every request from that tenant is rejected,
// including the admin trying to undo their own typo.
//
// Octets are range-checked rather than just shape-checked: a plain \d{1,3}
// pattern accepts "999.999.999.999", which looks saved but can never match.
const ipOrCidr = z.string().refine((v) => {
  const [addr, bits, ...rest] = v.split('/')
  if (rest.length > 0) return false
  if (bits !== undefined && !/^(3[0-2]|[12]?[0-9])$/.test(bits)) return false
  const octets = addr.split('.')
  return octets.length === 4 && octets.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)
}, 'Must be an IPv4 address (1.2.3.4) or CIDR range (1.2.3.0/24)')

const brandingSchema = z.object({
  name: z.string().max(120).optional(),
  logoText: z.string().max(6).optional(),
  logoUrl: z.string().max(100_000).nullable().optional(),
  primary: hsl.optional(),
  sidebarBg: hsl.optional(),
  primaryForeground: hsl.optional(),
  supportEmail: z.string().email().max(255).nullable().optional().or(z.literal('')),
  tagline: z.string().max(160).optional(),
  secondaryColor: hsl.nullable().optional(),
  supportPhone: z.string().regex(/^[\d ()+-]{0,24}$/, 'Digits/spaces/()+- only, max 24 chars').max(24).nullable().optional(),
  helpUrl: z.string().max(500).refine((v) => v === '' || /^https?:\/\//i.test(v), 'Must be an http(s) URL or empty').nullable().optional(),
  allowedIps: z.array(ipOrCidr).max(100).nullable().optional(),
  // ── Fields the admin tenant editor has always rendered controls for, but
  // which were missing from this schema — so zod stripped them on every save
  // and the values could never even be STORED. Same defect allowedIps had.
  // Comparing the 16 fields the page edits against the 13 this schema accepted
  // is how these surfaced; keep the two in sync when adding a control.
  requireMfa: z.boolean().nullable().optional(),
  // Why passwordPolicy being unsettable mattered: it is the value both
  // password-set flows validate against, so it was always null and the policy
  // enforcement had nothing to enforce. minLength floors at 8 to match the
  // platform standard — a tenant may raise it, never weaken it. Complexity
  // rules stay opt-in per tenant; the platform default remains a flat minimum.
  passwordPolicy: z.object({
    minLength: z.number().int().min(8).max(128).nullable().optional(),
    requireUppercase: z.boolean().optional(),
    requireNumber: z.boolean().optional(),
    requireSymbol: z.boolean().optional(),
  }).nullable().optional(),
  // Per-tenant sender identity. Consumed by email.service.ts getFromEmail()
  // and the SMS path; a VAR can also set these from /var/communications, but
  // a platform admin could not, because these were dropped here.
  emailFromName: z.string().max(120).nullable().optional(),
  emailFromAddress: z.string().email().max(255).nullable().optional().or(z.literal('')),
  smsSenderId: z.string().max(40).nullable().optional(),
})

const patchSchema = z.object({
  branding: brandingSchema.optional(),
  is_active: z.boolean().optional(),
  custom_domain: z.string().max(255).nullable().optional(),
  plan: z.string().max(50).nullable().optional(),
  features: z.record(z.boolean()).optional(),          // per-VAR module overrides
  license: z.record(z.number().int().min(-1)).optional(), // usage caps (-1 = unlimited)
  whitelabel: z.object({
    quoteSubject: z.string().max(200).optional(),
    quoteIntro: z.string().max(1000).optional(),
    notificationSignature: z.string().max(200).optional(),
    knowledgeBaseUrl: z.string().max(500).nullable().optional(),
    privacyPolicyUrl: z.string().max(500).nullable().optional(),
  }).optional(),
  // Days to keep per data class; null = keep forever. Read by the retention
  // dry-run report only — nothing deletes on the strength of this yet.
  retention: z.record(
    z.number().int().min(RETENTION_MIN_DAYS).max(RETENTION_MAX_DAYS).nullable(),
  ).optional(),
  // NOTE: a `security` block ({ passwordMinLength, mfaRequired, ipAllowlist })
  // used to be accepted here and written to settings.security. Nothing ever
  // read it back for enforcement, and no UI ever sent it, while three
  // identically-named controls on `branding` ARE live: branding.allowedIps
  // (enforced in requireAuth), branding.passwordPolicy (enforced on both
  // password-set flows) and branding.requireMfa. Accepting the dead block
  // meant an operator could set a security control that silently did nothing,
  // so it's gone — use the branding fields above.
  // An `integrations` block ({ smsProvider, smsFrom, smtpHost, smtpPort,
  // smtpUser, paymentProvider, ssoProvider, ssoEntityId }) was accepted here
  // too, and was equally inert: no UI ever sent it, and nothing reads it back
  // for behavior. Mail still goes out through Resend/Gmail env vars and SMS
  // through TWILIO_* env vars regardless of what was stored, so configuring a
  // tenant's own SMTP server or SSO provider changed nothing while reporting
  // success. Removed for the same reason as `security` above — the per-tenant
  // sender identity that IS honored lives on branding (emailFromName /
  // emailFromAddress / smsSenderId, consumed in email.service.ts).
})

async function guard() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() as NextResponse }
  if (auth.effectiveRole !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { auth }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await params

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('id, parent_tenant_id, name, slug, type, is_active, custom_domain, plan, branding, settings, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Failed to load tenant' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const settings = (data.settings ?? {}) as { features?: unknown; license?: unknown; whitelabel?: unknown; retention?: unknown }
  return NextResponse.json({
    data: {
      ...data,
      branding: resolveBranding(data.branding),
      features: resolveFeatures(undefined, settings.features),
      license: resolveLicense(settings.license),
      whitelabel: resolveWhiteLabel(settings.whitelabel),
      retention: resolveRetentionPolicy(settings.retention),
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard()
  if (g.error) return g.error
  const { id } = await params

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: existing, error: fetchErr } = await supabase
    .from('tenants').select('id, type, branding, settings').eq('id', id).maybeSingle()
  if (fetchErr) return NextResponse.json({ error: 'Failed to load tenant' }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Guard the platform tenant: its identity/status must not be white-labeled or disabled.
  if (existing.id === PLATFORM_TENANT_ID && (parsed.data.branding || parsed.data.is_active === false)) {
    return NextResponse.json({ error: 'The platform tenant cannot be re-branded or deactivated' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (parsed.data.branding) {
    // Merge onto the existing stored branding, then normalize.
    const merged = { ...(existing.branding as object), ...parsed.data.branding }
    update.branding = resolveBranding(merged)
  }
  if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active
  if (parsed.data.custom_domain !== undefined) update.custom_domain = parsed.data.custom_domain || null
  if (parsed.data.plan !== undefined) update.plan = parsed.data.plan || null

  // Merge feature/license/white-label overrides into settings JSONB (known keys only).
  if (parsed.data.features || parsed.data.license || parsed.data.whitelabel || parsed.data.retention) {
    const settings = { ...(existing.settings as Record<string, unknown> ?? {}) }
    if (parsed.data.features) {
      const cur = { ...(settings.features as Record<string, boolean> ?? {}) }
      for (const k of FEATURE_KEYS) if (k in parsed.data.features) cur[k] = parsed.data.features[k]
      settings.features = cur
    }
    if (parsed.data.license) {
      const cur = { ...(settings.license as Record<string, number> ?? {}) }
      for (const k of LIMIT_KEYS) if (k in parsed.data.license) cur[k] = parsed.data.license[k]
      settings.license = cur
    }
    if (parsed.data.whitelabel) {
      // Normalize through the resolver so only valid, sanitized values are stored.
      settings.whitelabel = resolveWhiteLabel({ ...(settings.whitelabel as object ?? {}), ...parsed.data.whitelabel })
    }
    if (parsed.data.retention) {
      const cur = { ...(settings.retention as Record<string, number | null> ?? {}) }
      for (const k of RETENTION_KEYS) if (k in parsed.data.retention) cur[k] = parsed.data.retention[k]
      settings.retention = cur
    }
    update.settings = settings
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tenants').update(update).eq('id', id)
    .select('id, name, slug, type, is_active, custom_domain, plan, branding').single()
  if (error) {
    console.error('Failed to update tenant:', error)
    return NextResponse.json({ error: 'Failed to update tenant' }, { status: 500 })
  }
  return NextResponse.json({ data: { ...data, branding: resolveBranding(data.branding) } })
}
