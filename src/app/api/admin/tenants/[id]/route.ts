// ============================================================================
// ADMIN TENANT DETAIL API — get / update a single tenant (branding, status)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveBranding } from '@/lib/branding'
import { resolveFeatures, FEATURE_KEYS } from '@/lib/features'
import { resolveLicense, LIMIT_KEYS } from '@/lib/licensing'
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
})

const patchSchema = z.object({
  branding: brandingSchema.optional(),
  is_active: z.boolean().optional(),
  custom_domain: z.string().max(255).nullable().optional(),
  plan: z.string().max(50).nullable().optional(),
  features: z.record(z.boolean()).optional(),          // per-VAR module overrides
  license: z.record(z.number().int().min(-1)).optional(), // usage caps (-1 = unlimited)
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
  const settings = (data.settings ?? {}) as { features?: unknown; license?: unknown }
  return NextResponse.json({
    data: {
      ...data,
      branding: resolveBranding(data.branding),
      features: resolveFeatures(undefined, settings.features),
      license: resolveLicense(settings.license),
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

  // Merge feature/license overrides into settings JSONB (store only known keys).
  if (parsed.data.features || parsed.data.license) {
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
