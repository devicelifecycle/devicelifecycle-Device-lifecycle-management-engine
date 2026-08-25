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
import { resolveSecurityConfig } from '@/lib/security-config'
import { resolveIntegrations } from '@/lib/integrations-config'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const PLATFORM_TENANT_ID = 'a0000000-0000-4000-a000-0000000000bb'
const hsl = z.string().regex(/^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/, 'HSL triplet like "221 83% 53%"')

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
  security: z.object({
    passwordMinLength: z.number().int().min(8).max(128).optional(),
    mfaRequired: z.boolean().optional(),
    ipAllowlist: z.array(z.string().max(64)).max(200).optional(),
  }).optional(),
  integrations: z.object({
    smsProvider: z.string().max(20).optional(),
    smsFrom: z.string().max(40).nullable().optional(),
    smtpHost: z.string().max(255).nullable().optional(),
    smtpPort: z.number().int().nullable().optional(),
    smtpUser: z.string().max(255).nullable().optional(),
    paymentProvider: z.string().max(20).optional(),
    ssoProvider: z.string().max(20).optional(),
    ssoEntityId: z.string().max(300).nullable().optional(),
  }).optional(),
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
  const settings = (data.settings ?? {}) as { features?: unknown; license?: unknown; whitelabel?: unknown; security?: unknown; integrations?: unknown }
  return NextResponse.json({
    data: {
      ...data,
      branding: resolveBranding(data.branding),
      security: resolveSecurityConfig(settings.security),
      integrations: resolveIntegrations(settings.integrations),
      features: resolveFeatures(undefined, settings.features),
      license: resolveLicense(settings.license),
      whitelabel: resolveWhiteLabel(settings.whitelabel),
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

  // Merge feature/license/white-label/security/integrations overrides into settings JSONB (known keys only).
  if (parsed.data.features || parsed.data.license || parsed.data.whitelabel || parsed.data.security || parsed.data.integrations) {
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
    if (parsed.data.security) {
      settings.security = resolveSecurityConfig({ ...(settings.security as object ?? {}), ...parsed.data.security })
    }
    if (parsed.data.integrations) {
      settings.integrations = resolveIntegrations({ ...(settings.integrations as object ?? {}), ...parsed.data.integrations })
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
