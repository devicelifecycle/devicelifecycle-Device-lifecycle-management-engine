import { describe, it, expect } from 'vitest'
import { accessTokenAal } from '@/lib/supabase/require-auth'

/**
 * accessTokenAal gates tenant MFA enforcement. It must never *invent* an aal2:
 * every malformed / unexpected input has to fall through to null so the gate
 * fails closed (blocked) rather than open (silently letting a single-factor
 * session past a tenant that requires two).
 */

function jwt(payload: unknown): string {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `header.${b64}.signature`
}

describe('accessTokenAal', () => {
  it('reads aal2 from a completed MFA session', () => {
    expect(accessTokenAal(jwt({ aal: 'aal2', sub: 'u1' }))).toBe('aal2')
  })

  it('reads aal1 from a password-only session', () => {
    expect(accessTokenAal(jwt({ aal: 'aal1' }))).toBe('aal1')
  })

  it('returns null when the token has no aal claim', () => {
    expect(accessTokenAal(jwt({ sub: 'u1' }))).toBeNull()
  })

  it('returns null for a non-string aal claim', () => {
    expect(accessTokenAal(jwt({ aal: 2 }))).toBeNull()
    expect(accessTokenAal(jwt({ aal: true }))).toBeNull()
  })

  it('returns null for undefined, empty, and structurally broken tokens', () => {
    expect(accessTokenAal(undefined)).toBeNull()
    expect(accessTokenAal('')).toBeNull()
    expect(accessTokenAal('not-a-jwt')).toBeNull()
    expect(accessTokenAal('header..signature')).toBeNull()
    expect(accessTokenAal('header.%%%not-base64%%%.signature')).toBeNull()
  })

  it('decodes base64url payloads containing - and _ substitutions', () => {
    // A payload whose standard base64 contains + and / — the chars base64url
    // replaces. If the substitution were skipped this would throw or mis-decode.
    const payload = { aal: 'aal2', note: 'ÿÿÿ>>>???' }
    const decoded = accessTokenAal(jwt(payload))
    expect(decoded).toBe('aal2')
  })
})
