// In-process TTL cache for user profiles.
// The proxy slow path (no routing cookies) costs getUser() + SELECT users — ~100-200ms.
// Caching the profile by userId eliminates the SELECT on warm invocations so only
// the Supabase JWT verification (~50ms) runs instead of both calls.
// TTL matches the routing-cookie maxAge (8h) so stale data can't outlive the cookies.
// Invalidated immediately on role change, deactivation, or org change.

type CachedProfile = {
  id: string
  email: string
  full_name: string | null
  role: string
  secondary_role: string | null
  organization_id: string | null
  is_active: boolean
  is_org_admin: boolean
  onboarding_completed_at: string | null
  notification_email: string | null
  notification_preferences: unknown
  last_login_at: string | null
  created_at: string
  updated_at: string
}

const _profileCache = new Map<string, { data: CachedProfile; expiresAt: number }>()
export const PROFILE_CACHE_TTL = 8 * 60 * 60 * 1000 // 8 hours — matches cookie maxAge

export function getProfileCache(userId: string): CachedProfile | null {
  const entry = _profileCache.get(userId)
  if (!entry || Date.now() >= entry.expiresAt) {
    _profileCache.delete(userId)
    return null
  }
  return entry.data
}

export function setProfileCache(userId: string, profile: CachedProfile): void {
  _profileCache.set(userId, { data: profile, expiresAt: Date.now() + PROFILE_CACHE_TTL })
}

export function invalidateProfileCache(userId: string): void {
  _profileCache.delete(userId)
}

export function invalidateAllProfileCaches(): void {
  _profileCache.clear()
}
