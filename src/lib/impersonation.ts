// ============================================================================
// CLIENT-SIDE IMPERSONATION HELPERS
// ----------------------------------------------------------------------------
// Lightweight browser helpers that mirror the server-side impersonation session
// (cookie `bb_impersonate_id`, set by the admin UI and consumed in
// `require-auth.ts`). The metadata blob lets the UI render a persistent banner
// without an extra round-trip. Everything here is client-only (`document`).
// ============================================================================

export interface ImpersonationMeta {
  id: string
  full_name?: string | null
  email?: string | null
  role?: string | null
}

const ID_COOKIE = 'bb_impersonate_id'
const META_COOKIE = 'bb_impersonate_meta'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

export function getImpersonationId(): string | null {
  return readCookie(ID_COOKIE)
}

export function getImpersonationMeta(): ImpersonationMeta | null {
  const raw = readCookie(META_COOKIE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ImpersonationMeta
    if (!parsed || typeof parsed.id !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function setImpersonation(id: string, target: ImpersonationMeta): void {
  if (typeof document === 'undefined') return
  const maxAge = 'max-age=3600; path=/'
  document.cookie = `bb_impersonate_id=${encodeURIComponent(id)}; ${maxAge}`
  document.cookie = `bb_impersonate_meta=${encodeURIComponent(JSON.stringify(target))}; ${maxAge}`
}

export function clearImpersonation(): void {
  if (typeof document === 'undefined') return
  const past = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  document.cookie = `${ID_COOKIE}=; ${past}`
  document.cookie = `${META_COOKIE}=; ${past}`
}
