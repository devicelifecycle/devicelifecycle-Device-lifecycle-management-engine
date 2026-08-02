// ============================================================================
// RUNTIME TENANT / DOMAIN RESOLUTION
// ============================================================================
// Maps a request host to a tenant: a custom domain, a "<slug>.<base>" subdomain,
// or the platform host. Everything unresolved falls back to the Byte-Back
// platform tenant, so current single-host routing behaves exactly as today —
// this only becomes active once VARs have custom domains/subdomains.

export const PLATFORM_TENANT_ID = 'a0000000-0000-4000-a000-0000000000bb'

export interface HostParts {
  /** A full custom domain (host that isn't under the base domain). */
  customDomain: string | null
  /** The "<slug>" of a "<slug>.<base>" subdomain. */
  subdomain: string | null
  /** True for the bare base domain / www / empty host (→ platform tenant). */
  isPlatformHost: boolean
}

function normalizeHost(host: string | null | undefined): string {
  return (host ?? '').trim().toLowerCase().split(':')[0].replace(/^www\./, '')
}

/** Pure: classify a host relative to the platform's base domain. */
export function parseHost(host: string | null | undefined, baseDomain: string): HostParts {
  const h = normalizeHost(host)
  const base = normalizeHost(baseDomain)
  const platform: HostParts = { customDomain: null, subdomain: null, isPlatformHost: true }

  if (!h || !base || h === base) return platform

  if (h.endsWith(`.${base}`)) {
    const sub = h.slice(0, -(base.length + 1))
    if (!sub || sub === 'www') return platform
    return { customDomain: null, subdomain: sub, isPlatformHost: false }
  }
  return { customDomain: h, subdomain: null, isPlatformHost: false }
}

interface TenantRow { id: string; slug: string; is_active: boolean }
interface MinimalClient {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: TenantRow | null }> }
    }
  }
}

/**
 * Resolve the tenant id for a host. Falls back to the platform tenant whenever
 * the host is the platform host or no matching active tenant is found.
 */
export async function resolveTenantIdByHost(
  supabase: MinimalClient,
  host: string | null | undefined,
  baseDomain: string,
): Promise<string> {
  const parts = parseHost(host, baseDomain)
  if (parts.isPlatformHost) return PLATFORM_TENANT_ID

  const { col, val } = parts.customDomain
    ? { col: 'custom_domain', val: parts.customDomain }
    : { col: 'slug', val: parts.subdomain as string }

  const { data } = await supabase.from('tenants').select('id, slug, is_active').eq(col, val).maybeSingle()
  return data && data.is_active ? data.id : PLATFORM_TENANT_ID
}
