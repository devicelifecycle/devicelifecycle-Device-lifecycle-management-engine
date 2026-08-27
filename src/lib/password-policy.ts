// ============================================================================
// PASSWORD POLICY - tenant-configured validation
// ============================================================================
import type { TenantBranding } from '@/lib/branding'

/**
 * Validate a candidate password against the tenant's password policy.
 * Returns a human-readable error, or null when the password satisfies the
 * policy (or when no policy is configured).
 */
export function validatePassword(
  password: string,
  policy?: TenantBranding['passwordPolicy'] | null,
): string | null {
  if (!policy) return null
  if (policy.minLength && password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters`
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain an uppercase letter'
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    return 'Password must contain a number'
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain a symbol'
  }
  return null
}
