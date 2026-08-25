// ============================================================================
// VAR FEATURE CONFIGURATION — enable/disable modules within the plan ceiling
// ============================================================================
// The platform admin decides which modules a VAR's plan includes
// (settings.features — the ceiling); the VAR can switch those on/off for its
// own org via settings.var_feature_overrides. Effective = ceiling AND var
// toggle: a VAR may turn an included module off for itself, but never
// re-enable one above its ceiling (PUT rejects that, and resolution in
// src/lib/features.ts enforces it too).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { FEATURE_KEYS, resolveFeatures, type FeatureKey } from '@/lib/features'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const CONFIG_ROLES = new Set(['admin', 'var_entity_admin'])

const VAR_OVERRIDES_KEY = 'var_feature_overrides'

/** Human labels/descriptions per module (features.ts carries no metadata). */
const FEATURE_META: Record<FeatureKey, { label: string; description: string }> = {
  trade_in: { label: 'Trade-In', description: 'Quote and process device trade-ins.' },
  cpo: { label: 'CPO', description: 'Certified pre-owned orders and buyback.' },
  rve: { label: 'Residual Value Estimator', description: 'Residual value estimates for devices.' },
  billing: { label: 'Billing', description: 'Invoices and billing from Byte-Back.' },
  reporting: { label: 'Reporting', description: 'Operational and sales reports.' },
  notifications: { label: 'Notifications', description: 'Email and in-app notifications.' },
  api_access: { label: 'API Access', description: 'Programmatic API access for integrations.' },
  sso: { label: 'SSO', description: 'Single sign-on for your team.' },
  vendor_auction: { label: 'Vendor Auctions', description: 'Open bidding across your vendor network.' },
  knowledge_base: { label: 'Knowledge Base', description: 'Self-serve help articles.' },
  chat: { label: 'Chat Assistant', description: 'In-app assistant over your data.' },
  impersonation: { label: 'Impersonation', description: 'Support login-as for your own users.' },
}

interface FeatureRow {
  key: FeatureKey
  label: string
  description: string
  /** Platform-set availability (settings.features) — the ceiling. */
  ceilingEnabled: boolean
  /** The stored VAR-side toggle; null = not set (follows the ceiling). */
  override: boolean | null
  /** The VAR-side switch position (override ?? ceiling). */
  varEnabled: boolean
  /** What enforcement actually uses: ceiling AND var toggle. */
  effective: boolean
}

function featureRows(settings: unknown): FeatureRow[] {
  const s = (settings && typeof settings === 'object' ? settings : {}) as {
    features?: unknown
    var_feature_overrides?: unknown
  }
  const ceiling = resolveFeatures(undefined, s.features)
  const raw = (s[VAR_OVERRIDES_KEY] && typeof s[VAR_OVERRIDES_KEY] === 'object')
    ? s[VAR_OVERRIDES_KEY] as Record<string, unknown>
    : {}
  return FEATURE_KEYS.map((key) => {
    const override = typeof raw[key] === 'boolean' ? raw[key] as boolean : null
    return {
      key,
      ...FEATURE_META[key],
      ceilingEnabled: ceiling[key],
      override,
      varEnabled: override ?? ceiling[key],
      effective: ceiling[key] && (override ?? true),
    }
  })
}

async function loadConfiguredTenant(tenantId: string | null) {
  if (!tenantId) return { error: NextResponse.json({ error: 'No tenant in scope' }, { status: 400 }) }
  const supabase = createServiceRoleClient()
  const { data: tenant, error } = await supabase
    .from('tenants').select('settings').eq('id', tenantId).maybeSingle()
  if (error || !tenant) return { error: NextResponse.json({ error: 'Tenant not found' }, { status: 404 }) }
  return { supabase, tenant }
}

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  // Only the VAR's own admins (or the platform admin) configure its modules.
  if (!CONFIG_ROLES.has(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const loaded = await loadConfiguredTenant(auth.tenantId)
  if ('error' in loaded) return loaded.error

  return NextResponse.json({ data: { features: featureRows(loaded.tenant.settings) } })
}

const putSchema = z.object({
  overrides: z.record(z.enum(FEATURE_KEYS), z.boolean()),
})

export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  if (!CONFIG_ROLES.has(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = putSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const loaded = await loadConfiguredTenant(auth.tenantId)
  if ('error' in loaded) return loaded.error
  const { supabase, tenant } = loaded

  // Read-modify-write keeps every unrelated settings key untouched.
  const settings = { ...(tenant.settings as Record<string, unknown> ?? {}) }
  const ceiling = resolveFeatures(undefined, settings.features)

  // Reject any attempt to re-enable a module above the platform-set ceiling.
  const aboveCeiling = FEATURE_KEYS.filter((k) => parsed.data.overrides[k] === true && !ceiling[k])
  if (aboveCeiling.length > 0) {
    return NextResponse.json(
      { error: `Not available on your plan: ${aboveCeiling.map((k) => FEATURE_META[k].label).join(', ')}` },
      { status: 400 },
    )
  }

  // Merge into the dedicated overrides key, preserving keys not sent.
  const existing = (settings[VAR_OVERRIDES_KEY] && typeof settings[VAR_OVERRIDES_KEY] === 'object')
    ? { ...(settings[VAR_OVERRIDES_KEY] as Record<string, unknown>) }
    : {}
  for (const k of FEATURE_KEYS) if (k in parsed.data.overrides) existing[k] = parsed.data.overrides[k]
  settings[VAR_OVERRIDES_KEY] = existing

  const { error } = await supabase.from('tenants').update({ settings }).eq('id', auth.tenantId)
  if (error) {
    console.error('Failed to update VAR feature toggles:', error)
    return NextResponse.json({ error: 'Failed to save feature configuration' }, { status: 500 })
  }

  // Return the updated rows so the client re-renders from persisted truth.
  return NextResponse.json({ data: { features: featureRows(settings) } })
}