// ============================================================================
// TENANT CONTEXT — resolve the current request's tenant from its host
// ============================================================================
// Public, read-only. Returns the tenant + branding for the request's host so
// the login page / shell can theme itself per VAR. Unknown hosts resolve to the
// Byte-Back platform tenant, so the single-host setup behaves exactly as today.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveTenantIdByHost, PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'
import { resolveBranding } from '@/lib/branding'
export const dynamic = 'force-dynamic'

const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'byte-back.ca'

export async function GET(request: NextRequest) {
  const host = request.headers.get('host')
  const supabase = createServiceRoleClient()

  const tenantId = await resolveTenantIdByHost(async (col, val) => {
    const { data } = await supabase.from('tenants').select('id, is_active').eq(col, val).maybeSingle()
    return data as { id: string; is_active: boolean } | null
  }, host, BASE_DOMAIN)
  const { data: tenant } = await supabase
    .from('tenants').select('id, name, slug, branding, is_active').eq('id', tenantId).maybeSingle()

  const isPlatform = tenantId === PLATFORM_TENANT_ID
  return NextResponse.json({
    data: {
      tenantId,
      isPlatform,
      name: tenant?.name ?? 'Byte-Back',
      slug: tenant?.slug ?? 'byte-back',
      branding: resolveBranding(tenant?.branding),
    },
  })
}
