// ============================================================================
// TENANT BRAND LABEL — resolve {name, tagline} for outbound emails/PDFs
// ============================================================================
// Emails and generated PDFs need the branding of the tenant the RECORD (order,
// shipment, invoice, ...) belongs to — not the current request's host. An admin
// acting on behalf of a VAR's order from the platform host must still send that
// VAR's branding, not Byte-Back's. This is deliberately a fresh DB lookup by
// tenant_id (never derived from `getServerTenant()`'s host-based resolution,
// which answers a different question: "whose UI is this page render for").
//
// Falls back to the platform default on a null/platform tenant id, or on any
// lookup error — a branding lookup failure must never block a send.

import { resolveBranding, DEFAULT_BRANDING } from '@/lib/branding'
import { PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'

export interface TenantBrandLabel {
  name: string
  tagline: string
}

const DEFAULT_LABEL: TenantBrandLabel = { name: DEFAULT_BRANDING.name, tagline: DEFAULT_BRANDING.tagline }

/**
 * Pure — resolve a tenant's stored branding JSONB (already fetched by the
 * caller) into a {name, tagline} label. No I/O, so it's trivially unit
 * testable. `tenantId` gates the null/platform case before `branding` is even
 * looked at.
 */
export function brandLabelFromRow(tenantId: string | null | undefined, branding: unknown): TenantBrandLabel {
  if (!tenantId || tenantId === PLATFORM_TENANT_ID) return DEFAULT_LABEL
  const resolved = resolveBranding(branding)
  return { name: resolved.name, tagline: resolved.tagline }
}

/**
 * Fetch + resolve in one call for the common case. `supabase` is intentionally
 * untyped (not the generated SupabaseClient<Database> type) — passing that
 * generic type into a shared helper triggers tsc's "excessively deep"
 * instantiation error, the same reasoning tenant-limits.ts documents for
 * keeping the generic client out of pure helpers. Any lookup error falls back
 * to the platform default rather than throwing — a branding lookup must never
 * block a send.
 */
export async function resolveTenantBrandLabel(
  tenantId: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<TenantBrandLabel> {
  if (!tenantId || tenantId === PLATFORM_TENANT_ID) return DEFAULT_LABEL
  try {
    const { data } = await supabase.from('tenants').select('branding').eq('id', tenantId).maybeSingle()
    return brandLabelFromRow(tenantId, data?.branding)
  } catch {
    return DEFAULT_LABEL
  }
}
