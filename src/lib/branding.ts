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
  /** Branded display name used in the email "From" header (white-label). Falls back to `name`. */
  emailFromName?: string | null
  /** Branded verified "From" address for outbound email (white-label). Falls back to the platform/env default. */
  emailFromAddress?: string | null
  /** Twilio sender ID / phone number used for outbound SMS (white-label). Falls back to the platform Twilio number. */
  smsSenderId?: string | null
  /** Optional secondary brand color as an HSL triplet (darker primary variant). */
  secondaryColor?: string | null
  /** Support phone surfaced alongside the support email. */
  supportPhone?: string | null
  /** Help/documentation link surfaced in customer-facing UI. */
  helpUrl?: string | null
  /** Marketing/tagline line. */
  tagline: string
  /** Tenant-level IP allowlist (exact IPv4 addresses or CIDR ranges). Empty/null = no restriction. */
  allowedIps?: string[] | null
  /** When true, users in this tenant must enroll MFA (enforced at login). */
  requireMfa?: boolean | null
  /** Tenant password policy applied to user-chosen passwords. */
  passwordPolicy?: {
    minLength?: number | null
    requireUppercase?: boolean | null
    requireNumber?: boolean | null
    requireSymbol?: boolean | null
  } | null
}

/** Darkened primary-blue variant used when a tenant sets no secondary color. */
const DEFAULT_SECONDARY_COLOR = '221 83% 41%'

/** Byte-Back platform defaults — the blue-on-blue identity. */
export const DEFAULT_BRANDING: TenantBranding = {
  name: 'Byte-Back',
  logoText: 'BB',
  logoUrl: null,
  primary: '221 83% 53%',
  sidebarBg: '222 47% 13%',
  primaryForeground: '0 0% 100%',
  supportEmail: null,
  emailFromName: null,
  emailFromAddress: null,
  smsSenderId: null,
  secondaryColor: DEFAULT_SECONDARY_COLOR,
  supportPhone: null,
  helpUrl: null,
  tagline: 'Device Lifecycle Management Platform',
  allowedIps: null,
  requireMfa: null,
  passwordPolicy: null,
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
    secondaryColor: cleanHsl(b.secondaryColor, DEFAULT_SECONDARY_COLOR),
    supportPhone: cleanStr(b.supportPhone, 32),
    helpUrl: cleanStr(b.helpUrl, 500),
    supportEmail: cleanStr(b.supportEmail, 255),
    emailFromName: cleanStr(b.emailFromName, 120),
    emailFromAddress: cleanStr(b.emailFromAddress, 255),
    smsSenderId: cleanStr(b.smsSenderId, 40),
    tagline: cleanStr(b.tagline, 160) ?? DEFAULT_BRANDING.tagline,
    allowedIps: Array.isArray(b.allowedIps)
      ? (b.allowedIps as unknown[]).filter((x) => typeof x === 'string' && x.length > 0).map(String).slice(0, 100)
      : null,
    requireMfa: typeof b.requireMfa === 'boolean' ? b.requireMfa : null,
    passwordPolicy:
      b.passwordPolicy && typeof b.passwordPolicy === 'object'
        ? (() => {
            const p = b.passwordPolicy as Record<string, unknown>
            return {
              minLength: typeof p.minLength === 'number' ? p.minLength : null,
              requireUppercase: !!p.requireUppercase,
              requireNumber: !!p.requireNumber,
              requireSymbol: !!p.requireSymbol,
            }
          })()
        : null,
  }
}

/**
 * CSS custom-property overrides for a resolved branding, for injection into a
 * scoped <style> or inline style. Only emits the theme tokens branding controls.
 */
export function brandingCssVars(b: TenantBranding): Record<string, string> {
  return {
    '--primary': b.primary,
    '--brand-secondary': b.secondaryColor ?? DEFAULT_SECONDARY_COLOR,
    '--sidebar-bg': b.sidebarBg,
    '--primary-foreground': b.primaryForeground,
  }
}

/**
 * Build the CSS to inject for a tenant's branding, or null when it is the
 * platform default (inject nothing → identical to the base stylesheet).
 *
 * Uses a doubled `:root:root` selector (specificity 0,2,0) so the tenant's
 * brand tokens win over both the base `:root` and the `.dark` overrides in
 * globals.css regardless of stylesheet order or active theme. Values are HSL
 * triplets already validated by resolveBranding (digits/spaces/% only), so the
 * string is safe to place verbatim in a <style> tag.
 */
export function tenantBrandingStyle(b: TenantBranding): string | null {
  if (isDefaultBranding(b)) return null
  const body = Object.entries(brandingCssVars(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  return `:root:root{${body}}`
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