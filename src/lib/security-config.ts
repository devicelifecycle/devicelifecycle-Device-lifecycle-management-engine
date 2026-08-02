// ============================================================================
// PER-TENANT SECURITY CONFIG
// ============================================================================
// Stored under tenants.settings.security. Password policy stays a flat minimum
// length with no complexity rules (platform standard); MFA-required and an IP
// allowlist are opt-in. Empty allowlist = allow all, so this is a no-op until a
// tenant sets restrictions.

export interface SecurityConfig {
  /** Minimum password length. Floor 8 (platform standard), max 128. */
  passwordMinLength: number
  /** Whether MFA is required for this tenant's users. */
  mfaRequired: boolean
  /** Exact IPs or "a.b.c.*" wildcards. Empty = no IP restriction. */
  ipAllowlist: string[]
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  passwordMinLength: 8,
  mfaRequired: false,
  ipAllowlist: [],
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function resolveSecurityConfig(raw: unknown): SecurityConfig {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const min = typeof s.passwordMinLength === 'number' ? clamp(Math.floor(s.passwordMinLength), 8, 128) : 8
  const list = Array.isArray(s.ipAllowlist)
    ? s.ipAllowlist.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()).slice(0, 200)
    : []
  return { passwordMinLength: min, mfaRequired: s.mfaRequired === true, ipAllowlist: list }
}

/** Is `ip` permitted by the allowlist? Empty allowlist allows everything. */
export function isIpAllowed(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true
  return allowlist.some((entry) => {
    if (entry.endsWith('.*')) return ip.startsWith(entry.slice(0, -1)) // "a.b.c.*" prefix
    return entry === ip
  })
}

/** Password policy error (length only — no complexity rules), or null if valid. */
export function passwordPolicyError(password: string, config: SecurityConfig): string | null {
  if (password.length < config.passwordMinLength) {
    return `Password must be at least ${config.passwordMinLength} characters.`
  }
  return null
}
