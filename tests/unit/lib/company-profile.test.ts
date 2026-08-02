import { describe, it, expect } from 'vitest'
import { resolveCompanyProfile, EMPTY_COMPANY_PROFILE } from '@/lib/company-profile'

describe('company profile resolver', () => {
  it('empty/invalid resolves to an empty profile', () => {
    expect(resolveCompanyProfile(null)).toEqual(EMPTY_COMPANY_PROFILE)
    expect(resolveCompanyProfile('nope')).toEqual(EMPTY_COMPANY_PROFILE)
    expect(resolveCompanyProfile({})).toEqual(EMPTY_COMPANY_PROFILE)
  })

  it('keeps provided top-level fields, trims, and nulls blanks', () => {
    const p = resolveCompanyProfile({ website: ' acme.com ', industry: 'Telecom', businessHours: '   ' })
    expect(p.website).toBe('acme.com')
    expect(p.industry).toBe('Telecom')
    expect(p.businessHours).toBeNull()
  })

  it('normalizes locations and drops empty ones', () => {
    const p = resolveCompanyProfile({ locations: [{ name: 'HQ', city: 'Toronto', province: 'ON' }, {}, { city: 'Calgary' }] })
    expect(p.locations).toHaveLength(2)
    expect(p.locations[0]).toMatchObject({ name: 'HQ', city: 'Toronto', province: 'ON' })
  })

  it('cleans departments (strings only) and contacts (need name or email)', () => {
    const p = resolveCompanyProfile({ departments: ['IT', '', 5, 'Ops'], contacts: [{ name: 'Sam', email: 'sam@x.com' }, {}, { phone: '123' }] })
    expect(p.departments).toEqual(['IT', 'Ops'])
    expect(p.contacts).toHaveLength(1)
    expect(p.contacts[0].name).toBe('Sam')
  })

  it('caps list sizes', () => {
    const p = resolveCompanyProfile({ departments: Array.from({ length: 200 }, (_, i) => `D${i}`) })
    expect(p.departments).toHaveLength(100)
  })
})
