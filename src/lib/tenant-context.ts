// ============================================================================
// SERVER TENANT CONTEXT — per-request tenant resolution for server components
// ============================================================================
// Resolves the current request's tenant (id + branding) from its host header,
// memoized per request via React cache(). The platform host is a pure fast path
// with NO database call, so today's single-host traffic pays zero extra cost and
// renders exactly as before. Only a real VAR host (custom domain / subdomain)
// triggers a lookup. Any failure — including the tenants table not yet existing
// on the live DB — falls back to the platform tenant, so this can never break a
// page render.

import { cache } from 'react'
import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveTenantIdByHost, parseHost, PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'
import { resolveBranding, DEFAULT_BRANDING, type TenantBranding } from '@/lib/branding'

const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'byte-back.ca'

export interface ServerTenant {
  tenantId: string
  isPlatform: boolean
  name: string
  slug: string
  branding: TenantBranding
}

const PLATFORM_TENANT: ServerTenant = {
  tenantId: PLATFORM_TENANT_ID,
  isPlatform: true,
  name: DEFAULT_BRANDING.name,
  slug: 'byte-back',
  branding: DEFAULT_BRANDING,
}

/**
 * Resolve the tenant for the current server request. Cached for the render, so
 * calling it in the layout and again deeper in the tree costs one lookup.
 */
export const getServerTenant = cache(async (): Promise<ServerTenant> => {
  let host: string | null = null
  try {
    host = (await headers()).get('host')
  } catch {
    return PLATFORM_TENANT
  }

  // Fast path: platform host classifies without touching the DB.
  if (parseHost(host, BASE_DOMAIN).isPlatformHost) return PLATFORM_TENANT

  try {
    const supabase = createServiceRoleClient()
    const tenantId = await resolveTenantIdByHost(async (col, val) => {
      const { data } = await supabase.from('tenants').select('id, is_active').eq(col, val).maybeSingle()
      return data as { id: string; is_active: boolean } | null
    }, host, BASE_DOMAIN)

    if (tenantId === PLATFORM_TENANT_ID) return PLATFORM_TENANT

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, slug, branding')
      .eq('id', tenantId)
      .maybeSingle()

    return {
      tenantId,
      isPlatform: false,
      name: tenant?.name ?? DEFAULT_BRANDING.name,
      slug: tenant?.slug ?? 'byte-back',
      branding: resolveBranding(tenant?.branding),
    }
  } catch {
    // DB unavailable or tenants table not migrated yet → safe platform default.
    return PLATFORM_TENANT
  }
})
