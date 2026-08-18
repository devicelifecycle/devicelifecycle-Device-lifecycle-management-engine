import { describe, it, expect } from 'vitest'
import { brandLabelFromRow, resolveTenantBrandLabel } from '@/lib/tenant-brand-label'
import { PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'

function makeClient(data: { branding: unknown } | null | 'throw') {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (data === 'throw') throw new Error('db down')
            return { data }
          },
        }),
      }),
    }),
  }
}

describe('brandLabelFromRow (pure)', () => {
  it('returns the platform default for a null tenantId', () => {
    expect(brandLabelFromRow(null, { name: 'Should be ignored' }))
      .toEqual({ name: 'Byte-Back', tagline: 'Device Lifecycle Management Platform' })
  })

  it('returns the platform default for the platform tenant id, even with branding set', () => {
    expect(brandLabelFromRow(PLATFORM_TENANT_ID, { name: 'Should be ignored' }).name).toBe('Byte-Back')
  })

  it('resolves a VAR tenant\'s own name and tagline', () => {
    expect(brandLabelFromRow('var-1', { name: 'Evergreen', tagline: 'Evergreen Device Portal', primary: '221 83% 53%' }))
      .toEqual({ name: 'Evergreen', tagline: 'Evergreen Device Portal' })
  })

  it('falls back to default when branding is empty/malformed', () => {
    expect(brandLabelFromRow('var-1', {})).toEqual({ name: 'Byte-Back', tagline: 'Device Lifecycle Management Platform' })
    expect(brandLabelFromRow('var-1', null)).toEqual({ name: 'Byte-Back', tagline: 'Device Lifecycle Management Platform' })
  })
})

describe('resolveTenantBrandLabel (fetch + resolve)', () => {
  it('skips the DB call entirely for a null tenantId', async () => {
    const result = await resolveTenantBrandLabel(null, makeClient('throw'))
    expect(result.name).toBe('Byte-Back')
  })

  it('skips the DB call entirely for the platform tenant id', async () => {
    const result = await resolveTenantBrandLabel(PLATFORM_TENANT_ID, makeClient('throw'))
    expect(result.name).toBe('Byte-Back')
  })

  it('fetches and resolves a VAR tenant\'s branding', async () => {
    const result = await resolveTenantBrandLabel('var-1', makeClient({ branding: { name: 'Evergreen', tagline: 'Evergreen Portal' } }))
    expect(result).toEqual({ name: 'Evergreen', tagline: 'Evergreen Portal' })
  })

  it('falls back to default when the tenant row is not found', async () => {
    const result = await resolveTenantBrandLabel('missing-tenant', makeClient(null))
    expect(result.name).toBe('Byte-Back')
  })

  it('falls back to default on a DB lookup error rather than throwing', async () => {
    const result = await resolveTenantBrandLabel('var-1', makeClient('throw'))
    expect(result.name).toBe('Byte-Back')
  })
})
