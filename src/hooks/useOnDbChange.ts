import { useEffect } from 'react'

/**
 * Calls `refetch` whenever any DB table changes (cross-device realtime event).
 * Use this in pages that fetch data with plain fetch() instead of React Query.
 * The `refetch` arg must be stable (wrapped in useCallback) to avoid effect re-runs.
 */
export function useOnDbChange(refetch: () => void) {
  useEffect(() => {
    window.addEventListener('dlm:db-change', refetch)
    return () => window.removeEventListener('dlm:db-change', refetch)
  }, [refetch])
}
