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

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

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

  return NextResponse.json({
    data: {
      isPlatform: tenant.id === PLATFORM_TENANT_ID,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, type: tenant.type, is_active: tenant.is_active, custom_domain: tenant.custom_domain },
      branding: resolveBranding(tenant.branding),
      commission: commissionConfigFromSettings(tenant.settings),
      invoices: invoices ?? [],
    },
  })
}
