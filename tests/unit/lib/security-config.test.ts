import { describe, it, expect } from 'vitest'
import {
  resolveSecurityConfig,
  isIpAllowed,
  passwordPolicyError,
  DEFAULT_SECURITY_CONFIG,
} from '@/lib/security-config'

describe('security config resolver', () => {
  it('empty resolves to platform defaults (flat 8-char min, no MFA, no IP limit)', () => {
    expect(resolveSecurityConfig(null)).toEqual(DEFAULT_SECURITY_CONFIG)
    expect(resolveSecurityConfig({})).toEqual(DEFAULT_SECURITY_CONFIG)
  })

  it('floors password min length at 8 and caps at 128', () => {
    expect(resolveSecurityConfig({ passwordMinLength: 4 }).passwordMinLength).toBe(8)
    expect(resolveSecurityConfig({ passwordMinLength: 500 }).passwordMinLength).toBe(128)
    expect(resolveSecurityConfig({ passwordMinLength: 12 }).passwordMinLength).toBe(12)
  })

  it('reads mfaRequired only when strictly true and cleans the IP list', () => {
    expect(resolveSecurityConfig({ mfaRequired: true }).mfaRequired).toBe(true)
    expect(resolveSecurityConfig({ mfaRequired: 'yes' }).mfaRequired).toBe(false)
    expect(resolveSecurityConfig({ ipAllowlist: ['1.2.3.4', '  ', 5, '10.0.0.*'] }).ipAllowlist)
      .toEqual(['1.2.3.4', '10.0.0.*'])
  })
})

describe('IP allowlist', () => {
  it('empty allowlist allows everything', () => {
    expect(isIpAllowed('9.9.9.9', [])).toBe(true)
  })
  it('matches exact IPs and wildcard prefixes', () => {
    expect(isIpAllowed('1.2.3.4', ['1.2.3.4'])).toBe(true)
    expect(isIpAllowed('1.2.3.5', ['1.2.3.4'])).toBe(false)
    expect(isIpAllowed('10.0.0.99', ['10.0.0.*'])).toBe(true)
    expect(isIpAllowed('10.0.1.1', ['10.0.0.*'])).toBe(false)
  })
})

describe('password policy (length only)', () => {
  it('rejects below the minimum, accepts at/above', () => {
    expect(passwordPolicyError('short', DEFAULT_SECURITY_CONFIG)).toContain('at least 8')
    expect(passwordPolicyError('longenough', DEFAULT_SECURITY_CONFIG)).toBeNull()
    expect(passwordPolicyError('exactly8', DEFAULT_SECURITY_CONFIG)).toBeNull()
  })
  it('has no complexity requirement (all-lowercase 8 chars passes)', () => {
    expect(passwordPolicyError('abcdefgh', DEFAULT_SECURITY_CONFIG)).toBeNull()
  })
})
