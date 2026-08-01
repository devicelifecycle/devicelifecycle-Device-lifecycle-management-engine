// ============================================================================
// VAR CONSOLE — overview for the caller's own tenant
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveBranding } from '@/lib/branding'
import { commissionConfigFromSettings } from '@/lib/commission'
export const dynamic = 'force-dynamic'

const PLATFORM_TENANT_ID = 'a0000000-0000-4000-a000-0000000000bb'

// Only VAR operators (or the platform admin) may read a tenant console. This
// keeps end-customer / vendor / internal-COE roles — who currently all resolve
// to the platform tenant — from reading Byte-Back's commission/margin model.
const VAR_CONSOLE_ROLES = new Set([
  'admin', 'var_entity_admin', 'var_regional_manager', 'var_sales_rep',
])

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  if (!VAR_CONSOLE_ROLES.has(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = auth.tenantId
  if (!tenantId) return NextResponse.json({ error: 'No tenant in scope' }, { status: 400 })

  const supabase = createServiceRoleClient()

  const [{ data: tenant }, { data: invoices }] = await Promise.all([
    supabase.from('tenants')
      .select('id, name, slug, type, is_active, branding, settings, custom_domain')
      .eq('id', tenantId).maybeSingle(),
    supabase.from('invoices')
      .select('id, invoice_number, period_start, period_end, status, total, currency')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  // A VAR only ever sees its own corp/rep margins — Byte-Back's blended take
  // (platform commission / product margin / holdback) is BB-internal and is
  // redacted for everyone except the platform admin.
  const full = commissionConfigFromSettings(tenant.settings)
  const isAdmin = auth.effectiveRole === 'admin'
  const commission = isAdmin
    ? full
    : { platformCommissionPct: null, productMarginPct: null, holdbackPct: null, corpMargin: full.corpMargin, repMargin: full.repMargin }

  return NextResponse.json({
    data: {
      isPlatform: tenant.id === PLATFORM_TENANT_ID,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, type: tenant.type, is_active: tenant.is_active, custom_domain: tenant.custom_domain },
      branding: resolveBranding(tenant.branding),
      commission,
      invoices: invoices ?? [],
    },
  })
}
