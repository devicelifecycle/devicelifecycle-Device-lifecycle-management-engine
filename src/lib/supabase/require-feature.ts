// ============================================================================
// FEATURE GUARD — for Route Handlers (per-tenant module enablement)
// ============================================================================
// Feature flags were settable in two admin UIs, validated, persisted, and read
// back for display — while exactly one route in the entire app actually gated
// on them. A platform admin could switch a tenant's module off, watch the UI
// confirm it saved, and the module kept working. This is the shared guard that
// makes a toggle mean something.
//
// Two properties worth keeping:
//   • No-op by default. An unset tenant resolves to DEFAULT_FEATURES, so this
//     only bites once someone deliberately turns a module off (or a plan
//     ceiling excludes it).
//   • Fails CLOSED. A settings lookup we can't complete must not wave the
//     request through, or the gate is bypassable by making the lookup fail.
//     Same reasoning the quota check in /api/orders documents.

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { tenantLimits } from '@/lib/tenant-limits'
import { featureBlockMessage } from '@/lib/quota'
import type { FeatureKey } from '@/lib/features'

/**
 * Returns a 403 response when `key` is not enabled for `tenantId`, else null.
 *
 * A null/undefined tenantId means there is no tenant to gate against (the
 * platform's own context), which is allowed — the platform is not a VAR on a
 * plan.
 */
export async function featureGate(
  tenantId: string | null | undefined,
  key: FeatureKey,
  label: string,
): Promise<NextResponse | null> {
  if (!tenantId) return null
  try {
    const supabase = createServiceRoleClient()
    const { data: tenant, error } = await supabase
      .from('tenants').select('settings').eq('id', tenantId).maybeSingle()
    if (error) {
      console.error(`featureGate(${key}): settings lookup failed`, error)
      return NextResponse.json({ error: `Could not verify whether ${label} is enabled` }, { status: 503 })
    }
    const { features } = tenantLimits(tenant?.settings)
    const blocked = featureBlockMessage(features, key, label)
    return blocked ? NextResponse.json({ error: blocked }, { status: 403 }) : null
  } catch (err) {
    console.error(`featureGate(${key}): unexpected failure`, err)
    return NextResponse.json({ error: `Could not verify whether ${label} is enabled` }, { status: 503 })
  }
}
