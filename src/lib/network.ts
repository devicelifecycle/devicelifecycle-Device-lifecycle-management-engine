// ============================================================================
// NETWORK HELPERS — client IP resolution + CIDR/allowlist matching
// ============================================================================

/** Minimal structural header type (compatible with next/headers ReadonlyHeaders). */
type HeadersLike = { get(name: string): string | null }

/** Best-effort client IP from proxy headers (falls back to 'unknown'). */
export function getClientIp(headers: HeadersLike): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/** True if `ip` is in `allowlist` (exact IPv4 addresses or CIDR ranges). */
export function ipInAllowlist(ip: string, allowlist: string[]): boolean {
  if (!ip || ip === 'unknown') return false
  for (const entry of allowlist) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    if (trimmed.includes('/')) {
      if (cidrMatches(ip, trimmed)) return true
    } else if (ip === trimmed) {
      return true
    }
  }
  return false
}

function cidrMatches(ip: string, cidr: string): boolean {
  try {
    const [base, bitsStr] = cidr.split('/')
    const bits = parseInt(bitsStr, 10)
    const ipParts = ip.split('.').map(Number)
    const baseParts = base.split('.').map(Number)
    if (ipParts.length !== 4 || baseParts.length !== 4) return false
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    const ipInt = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0
    const baseInt = ((baseParts[0] << 24) | (baseParts[1] << 16) | (baseParts[2] << 8) | baseParts[3]) >>> 0
    return (ipInt & mask) === (baseInt & mask)
  } catch {
    return false
  }
}