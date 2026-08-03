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

// Lookup stub matching the TenantLookup callback shape.
const lookupOf = (row: { id: string; is_active: boolean } | null) => async () => row

describe('resolveTenantIdByHost', () => {
  it('platform host → platform tenant (no lookup needed)', async () => {
    expect(await resolveTenantIdByHost(lookupOf(null), 'byte-back.ca', BASE)).toBe(PLATFORM_TENANT_ID)
  })

  it('active matching tenant → its id', async () => {
    expect(await resolveTenantIdByHost(lookupOf({ id: 'tenant-1', is_active: true }), 'acme.byte-back.ca', BASE)).toBe('tenant-1')
  })

  it('no match or inactive tenant → platform fallback', async () => {
    expect(await resolveTenantIdByHost(lookupOf(null), 'nope.byte-back.ca', BASE)).toBe(PLATFORM_TENANT_ID)
    expect(await resolveTenantIdByHost(lookupOf({ id: 'tenant-2', is_active: false }), 'acme.byte-back.ca', BASE)).toBe(PLATFORM_TENANT_ID)
  })

  it('passes the right column to the lookup', async () => {
    let seen = ''
    const lookup = async (col: 'custom_domain' | 'slug') => { seen = col; return null }
    await resolveTenantIdByHost(lookup, 'portal.acme.com', BASE)
    expect(seen).toBe('custom_domain')
    await resolveTenantIdByHost(lookup, 'acme.byte-back.ca', BASE)
    expect(seen).toBe('slug')
  })
})
