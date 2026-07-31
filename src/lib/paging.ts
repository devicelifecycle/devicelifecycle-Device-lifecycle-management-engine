// ============================================================================
// PAGINATION — shared request paging for list endpoints
// ============================================================================
// Every list API is paginated (never fetch-all) so a table with millions of
// rows returns a bounded page. Clamps page>=1 and limit to [1, MAX_LIMIT].

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

export interface Paging {
  page: number
  limit: number
  /** 0-based inclusive start for supabase .range(). */
  from: number
  /** 0-based inclusive end for supabase .range(). */
  to: number
}

function clampInt(v: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(v ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Parse ?page & ?limit from a request URL into safe range bounds. */
export function parsePaging(request: { url: string }): Paging {
  const params = new URL(request.url).searchParams
  const page = clampInt(params.get('page'), 1, 1, Number.MAX_SAFE_INTEGER)
  const limit = clampInt(params.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
  const from = (page - 1) * limit
  return { page, limit, from, to: from + limit - 1 }
}
