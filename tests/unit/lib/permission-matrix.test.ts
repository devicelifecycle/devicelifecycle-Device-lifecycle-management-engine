import { describe, it, expect } from 'vitest'
import {
  PERMISSION_MATRIX,
  matrixAccess,
  hasMatrixAccess,
  type MatrixFunction,
} from '@/lib/permission-matrix'

describe('permission matrix (from the outline)', () => {
  it('platform settings + manage VARs are platform-admin only', () => {
    expect(matrixAccess('platform_settings', 'platform_admin')).toBe('full')
    expect(hasMatrixAccess('platform_settings', 'var_admin')).toBe(false)
    expect(hasMatrixAccess('platform_settings', 'customer_admin')).toBe(false)
    expect(hasMatrixAccess('manage_vars', 'var_admin')).toBe(false)
  })

  it('reporting scope narrows global → tenant → company', () => {
    expect(matrixAccess('reporting', 'platform_admin')).toBe('global')
    expect(matrixAccess('reporting', 'var_admin')).toBe('tenant')
    expect(matrixAccess('reporting', 'customer_admin')).toBe('company')
  })

  it('a VAR brands + manages only its own', () => {
    expect(matrixAccess('white_label_branding', 'var_admin')).toBe('own')
    expect(matrixAccess('manage_customers', 'var_admin')).toBe('own')
  })

  it('impersonation: platform full, VAR own customers, customer none', () => {
    expect(matrixAccess('impersonate_users', 'platform_admin')).toBe('full')
    expect(matrixAccess('impersonate_users', 'var_admin')).toBe('own_customers')
    expect(hasMatrixAccess('impersonate_users', 'customer_admin')).toBe(false)
  })

  it('licensing: platform defines, VAR assigns, customer views', () => {
    expect(matrixAccess('licensing', 'platform_admin')).toBe('full')
    expect(matrixAccess('licensing', 'var_admin')).toBe('assign')
    expect(matrixAccess('licensing', 'customer_admin')).toBe('view')
  })

  it('every function defines all three roles', () => {
    for (const fn of Object.keys(PERMISSION_MATRIX) as MatrixFunction[]) {
      expect(PERMISSION_MATRIX[fn].platform_admin).toBeDefined()
      expect(PERMISSION_MATRIX[fn].var_admin).toBeDefined()
      expect(PERMISSION_MATRIX[fn].customer_admin).toBeDefined()
    }
  })
})
