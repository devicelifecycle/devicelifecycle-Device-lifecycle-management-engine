import type { UserRole } from '@/types'

/**
 * A post-login `redirect` target, only if it is a path on THIS site.
 * `startsWith('/')` alone accepted `//evil.com` and `/\evil.com`, which
 * browsers treat as another origin — an open redirect from the login page.
 */
export function safeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  // Control characters (tab/newline tricks) — checked without a control-char regex.
  if ([...raw].some((ch) => ch.charCodeAt(0) < 0x20)) return null
  try {
    const u = new URL(raw, 'https://dlm.invalid')
    if (u.origin !== 'https://dlm.invalid') return null
    return u.pathname + u.search + u.hash
  } catch {
    return null
  }
}

/** The ?redirect= on the current page, if safe (browser only). */
export function currentSafeRedirect(): string | null {
  if (typeof window === 'undefined') return null
  return safeRedirectPath(new URLSearchParams(window.location.search).get('redirect'))
}

export function getDefaultAppPathForRole(role: UserRole | null | undefined): string {
  switch (role) {
    case 'customer':
      return '/dashboard'
    case 'vendor':
      return '/vendor/orders'
    default:
      return '/dashboard'
  }
}
