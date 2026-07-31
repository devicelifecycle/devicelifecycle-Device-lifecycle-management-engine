// ============================================================================
// WHITE-LABEL BRANDING
// ============================================================================
// Normalizes a tenant's branding JSONB into a full object. Empty/invalid ->
// Byte-Back defaults, so current rendering is unchanged. Colors are HSL
// triplets ("H S% L%") to drop straight into the globals.css CSS vars.

export interface TenantBranding {
  /** Display name shown in nav, emails, page titles. */
  name: string
  /** Short mark/monogram text (e.g. "BB"). */
  logoText: string
  /** Optional data-URI or absolute logo image URL. */
  logoUrl: string | null
  /** Primary brand color as an HSL triplet, e.g. "221 83% 53%". */
  primary: string
  /** Sidebar background as an HSL triplet. */
  sidebarBg: string
  /** Accent/foreground-on-primary text color as an HSL triplet. */
  primaryForeground: string
  /** Support email surfaced in customer-facing UI + email footers. */
  supportEmail: string | null
  /** Marketing/tagline line. */
  tagline: string
}

/** Byte-Back platform defaults — the blue-on-blue identity. */
export const DEFAULT_BRANDING: TenantBranding = {
  name: 'Byte-Back',
  logoText: 'BB',
  logoUrl: null,
  primary: '221 83% 53%',
  sidebarBg: '222 47% 13%',
  primaryForeground: '0 0% 100%',
  supportEmail: null,
  tagline: 'Device Lifecycle Management Platform',
}

/** HSL triplet like "221 83% 53%" (H 0-360, S/L 0-100%). */
const HSL_TRIPLET = /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/

function cleanStr(v: unknown, max = 255): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t.slice(0, max) : null
}

function cleanHsl(v: unknown, fallback: string): string {
  return typeof v === 'string' && HSL_TRIPLET.test(v.trim()) ? v.trim() : fallback
}

/**
 * Resolve a tenant's stored branding JSONB into a complete branding object.
 * Unknown/invalid fields fall back to the Byte-Back defaults, so a malformed
 * or empty record can never break rendering.
 */
export function resolveBranding(raw: unknown): TenantBranding {
  if (!raw || typeof raw !== 'object') return DEFAULT_BRANDING
  const b = raw as Record<string, unknown>
  return {
    name: cleanStr(b.name, 120) ?? DEFAULT_BRANDING.name,
    logoText: (cleanStr(b.logoText, 6) ?? DEFAULT_BRANDING.logoText).toUpperCase(),
    logoUrl: cleanStr(b.logoUrl, 100_000),
    primary: cleanHsl(b.primary, DEFAULT_BRANDING.primary),
    sidebarBg: cleanHsl(b.sidebarBg, DEFAULT_BRANDING.sidebarBg),
    primaryForeground: cleanHsl(b.primaryForeground, DEFAULT_BRANDING.primaryForeground),
    supportEmail: cleanStr(b.supportEmail, 255),
    tagline: cleanStr(b.tagline, 160) ?? DEFAULT_BRANDING.tagline,
  }
}

/**
 * CSS custom-property overrides for a resolved branding, for injection into a
 * scoped <style> or inline style. Only emits the theme tokens branding controls.
 */
export function brandingCssVars(b: TenantBranding): Record<string, string> {
  return {
    '--primary': b.primary,
    '--sidebar-bg': b.sidebarBg,
    '--primary-foreground': b.primaryForeground,
  }
}

/** True when branding is effectively the platform default (nothing customized). */
export function isDefaultBranding(b: TenantBranding): boolean {
  return (
    b.name === DEFAULT_BRANDING.name &&
    b.primary === DEFAULT_BRANDING.primary &&
    b.sidebarBg === DEFAULT_BRANDING.sidebarBg &&
    b.logoUrl === null
  )
}
