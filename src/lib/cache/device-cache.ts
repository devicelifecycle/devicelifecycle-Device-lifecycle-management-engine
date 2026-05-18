// In-process TTL cache for device catalog listings.
// Devices change infrequently (admin-only mutations). 5-minute TTL lets the
// catalog page and order creation form skip a DB round-trip on warm invocations.
// Cleared immediately on any create / update / delete mutation.

const _deviceCache = new Map<string, { data: unknown; expiresAt: number }>()
export const DEVICE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function getDeviceCache(key: string): unknown | null {
  const entry = _deviceCache.get(key)
  if (!entry || Date.now() >= entry.expiresAt) return null
  return entry.data
}

export function setDeviceCache(key: string, data: unknown): void {
  _deviceCache.set(key, { data, expiresAt: Date.now() + DEVICE_CACHE_TTL })
}

export function invalidateDeviceCatalogCache(): void {
  _deviceCache.clear()
}
