// ============================================================================
// WHITE-LABEL CONTENT — per-VAR email/notification templates + links
// ============================================================================
// Stored under tenants.settings.whitelabel. Empty/invalid resolves to platform
// defaults, so email/notification behavior is unchanged until a VAR customizes.

export interface WhiteLabelContent {
  quoteSubject: string
  quoteIntro: string
  notificationSignature: string
  knowledgeBaseUrl: string | null
  privacyPolicyUrl: string | null
}

export const DEFAULT_WHITELABEL: WhiteLabelContent = {
  quoteSubject: 'Your quote from {{company}}',
  quoteIntro: 'Hi {{customer}}, your quote is ready. See the attached details.',
  notificationSignature: 'The {{company}} team',
  knowledgeBaseUrl: null,
  privacyPolicyUrl: null,
}

function cleanStr(v: unknown, max: number, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback
}
function cleanUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const t = v.trim().slice(0, 500)
  return /^https?:\/\//i.test(t) ? t : null // only http(s) links
}

/** Resolve stored white-label content, filling any gaps with platform defaults. */
export function resolveWhiteLabel(raw: unknown): WhiteLabelContent {
  const w = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    quoteSubject: cleanStr(w.quoteSubject, 200, DEFAULT_WHITELABEL.quoteSubject),
    quoteIntro: cleanStr(w.quoteIntro, 1000, DEFAULT_WHITELABEL.quoteIntro),
    notificationSignature: cleanStr(w.notificationSignature, 200, DEFAULT_WHITELABEL.notificationSignature),
    knowledgeBaseUrl: cleanUrl(w.knowledgeBaseUrl),
    privacyPolicyUrl: cleanUrl(w.privacyPolicyUrl),
  }
}

/**
 * Interpolate {{token}} placeholders from a plain values map. Unknown tokens
 * render empty. Values are inserted literally (no nested/recursive expansion),
 * so a value that itself contains "{{...}}" cannot trigger further substitution.
 */
export function renderTemplate(template: string, values: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = values[key]
    return v === undefined || v === null ? '' : String(v)
  })
}
