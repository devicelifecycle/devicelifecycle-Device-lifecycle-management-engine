// ============================================================================
// LICENSING / USAGE QUOTAS
// ============================================================================
// Enterprise Best Practice from the outline: usage limits (customers, users,
// storage, API calls, transactions) allocated by the platform to VARs, then
// distributed by VARs to their customers. A limit of -1 means unlimited.
// Defaults are unlimited so enabling licensing never retroactively caps anyone;
// finite caps come from an assigned plan.

export const LIMIT_KEYS = [
  'customers', 'users', 'storageMb', 'apiCallsPerMonth', 'transactionsPerMonth',
] as const

export type LimitKey = (typeof LIMIT_KEYS)[number]
export type LicenseLimits = Record<LimitKey, number>

export const UNLIMITED = -1

export const DEFAULT_LICENSE: LicenseLimits = {
  customers: UNLIMITED,
  users: UNLIMITED,
  storageMb: UNLIMITED,
  apiCallsPerMonth: UNLIMITED,
  transactionsPerMonth: UNLIMITED,
}

/** Normalize a stored license blob; unset/invalid keys become unlimited. */
export function resolveLicense(raw: unknown): LicenseLimits {
  const src = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const out = { ...DEFAULT_LICENSE }
  for (const k of LIMIT_KEYS) {
    const v = src[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v < 0 ? UNLIMITED : Math.floor(v)
  }
  return out
}

export interface QuotaStatus {
  limit: number
  used: number
  remaining: number
  unlimited: boolean
  exceeded: boolean
  /** 0..1 fraction used (0 when unlimited). */
  ratio: number
}

/** Status of one metric given its limit and current usage. */
export function quotaStatus(limit: number, used: number): QuotaStatus {
  const u = Math.max(0, used)
  const unlimited = limit < 0
  const remaining = unlimited ? Infinity : Math.max(0, limit - u)
  return {
    limit,
    used: u,
    remaining,
    unlimited,
    exceeded: !unlimited && u > limit,
    ratio: unlimited || limit === 0 ? 0 : Math.min(1, u / limit),
  }
}

/** Can `count` more of this metric be allocated without breaching the limit? */
export function canAllocate(limit: number, used: number, count = 1): boolean {
  if (limit < 0) return true
  return Math.max(0, used) + count <= limit
}
