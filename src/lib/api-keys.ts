// ============================================================================
// API KEYS — generation, hashing, verification
// ============================================================================
// Keys are shown to the user exactly once at creation; only a SHA-256 hash and a
// short display prefix are stored. Verification hashes the presented key and
// compares in constant time.

import { randomBytes, createHash, timingSafeEqual } from 'crypto'

export interface GeneratedApiKey {
  /** Full secret — returned once, never stored. */
  plaintext: string
  /** Short prefix stored for display (e.g. "dlm_ab12cd34"). */
  prefix: string
  /** SHA-256 hex hash stored for verification. */
  hash: string
}

/** Hash a key with SHA-256 (hex). */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/** Create a new random API key. */
export function generateApiKey(): GeneratedApiKey {
  const plaintext = `dlm_${randomBytes(24).toString('base64url')}`
  return { plaintext, prefix: plaintext.slice(0, 12), hash: hashApiKey(plaintext) }
}

/** Constant-time check that a presented key matches a stored hash. */
export function verifyApiKey(plaintext: string, hash: string): boolean {
  if (typeof plaintext !== 'string' || typeof hash !== 'string') return false
  const a = Buffer.from(hashApiKey(plaintext), 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}
