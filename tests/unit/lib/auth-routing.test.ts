import { describe, expect, it } from 'vitest'
import { getDefaultAppPathForRole } from '@/lib/auth-routing'

describe('getDefaultAppPathForRole', () => {
  it('routes customers to their dashboard', () => {
    expect(getDefaultAppPathForRole('customer')).toBe('/dashboard')
  })

  it('routes vendors to their orders workspace', () => {
    expect(getDefaultAppPathForRole('vendor')).toBe('/vendor/orders')
  })

  it('keeps internal roles on the shared dashboard', () => {
    expect(getDefaultAppPathForRole('admin')).toBe('/dashboard')
    expect(getDefaultAppPathForRole('sales')).toBe('/dashboard')
  })
})
