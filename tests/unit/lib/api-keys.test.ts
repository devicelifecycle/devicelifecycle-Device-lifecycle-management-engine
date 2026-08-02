import { describe, it, expect } from 'vitest'
import { generateApiKey, hashApiKey, verifyApiKey } from '@/lib/api-keys'

describe('API keys', () => {
  it('generates a dlm_ key with a 12-char prefix and 64-hex hash', () => {
    const k = generateApiKey()
    expect(k.plaintext.startsWith('dlm_')).toBe(true)
    expect(k.prefix).toBe(k.plaintext.slice(0, 12))
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verifies the right key and rejects the wrong one', () => {
    const k = generateApiKey()
    expect(verifyApiKey(k.plaintext, k.hash)).toBe(true)
    expect(verifyApiKey(k.plaintext + 'x', k.hash)).toBe(false)
    expect(verifyApiKey('dlm_wrong', k.hash)).toBe(false)
  })

  it('produces unique keys', () => {
    const a = generateApiKey(), b = generateApiKey()
    expect(a.plaintext).not.toBe(b.plaintext)
    expect(a.hash).not.toBe(b.hash)
  })

  it('hash is stable and never equals the plaintext', () => {
    expect(hashApiKey('dlm_abc')).toBe(hashApiKey('dlm_abc'))
    expect(hashApiKey('dlm_abc')).not.toBe('dlm_abc')
  })

  it('rejects malformed inputs safely', () => {
    expect(verifyApiKey('', '')).toBe(false)
    expect(verifyApiKey('x', 'nothex')).toBe(false)
  })
})
