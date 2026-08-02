import { describe, it, expect } from 'vitest'
import { parseHost, resolveTenantIdByHost, PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'

const BASE = 'byte-back.ca'

describe('parseHost', () => {
  it('bare base domain / www / empty → platform host', () => {
    for (const h of ['byte-back.ca', 'www.byte-back.ca', '', null, undefined]) {
      expect(parseHost(h, BASE).isPlatformHost).toBe(true)
    }
  })

  it('extracts a subdomain slug', () => {
    expect(parseHost('acme.byte-back.ca', BASE)).toEqual({ customDomain: null, subdomain: 'acme', isPlatformHost: false })
  })

  it('treats a non-base host as a custom domain', () => {
    expect(parseHost('portal.acme.com', BASE)).toEqual({ customDomain: 'portal.acme.com', subdomain: null, isPlatformHost: false })
  })

  it('strips port and lowercases', () => {
    expect(parseHost('ACME.Byte-Back.ca:3000', BASE)).toEqual({ customDomain: null, subdomain: 'acme', isPlatformHost: false })
  })
})

// Minimal fake matching the client shape resolveTenantIdByHost expects.
function fakeClient(row: { id: string; slug: string; is_active: boolean } | null) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
  }
}

describe('resolveTenantIdByHost', () => {
  it('platform host → platform tenant (no lookup needed)', async () => {
    expect(await resolveTenantIdByHost(fakeClient(null), 'byte-back.ca', BASE)).toBe(PLATFORM_TENANT_ID)
  })

  it('active matching tenant → its id', async () => {
    const row = { id: 'tenant-1', slug: 'acme', is_active: true }
    expect(await resolveTenantIdByHost(fakeClient(row), 'acme.byte-back.ca', BASE)).toBe('tenant-1')
  })

  it('no match or inactive tenant → platform fallback', async () => {
    expect(await resolveTenantIdByHost(fakeClient(null), 'nope.byte-back.ca', BASE)).toBe(PLATFORM_TENANT_ID)
    const inactive = { id: 'tenant-2', slug: 'acme', is_active: false }
    expect(await resolveTenantIdByHost(fakeClient(inactive), 'acme.byte-back.ca', BASE)).toBe(PLATFORM_TENANT_ID)
  })
})
