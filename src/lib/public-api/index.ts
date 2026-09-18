// ============================================================================
// PUBLIC API v1 — shared plumbing for /api/v1/*
// ============================================================================
//
// The one place every v1 route goes through. It exists so that four things
// cannot be forgotten by any individual route:
//
//   1. Auth. `requireApiKey()` resolves the bearer token to a tenant. It uses
//      the SERVICE-ROLE client, which bypasses RLS — so tenant scoping in this
//      API is entirely the application's job. `tenantQuery()` below is the only
//      sanctioned way to start a query, and it applies `.eq('tenant_id', …)`
//      before the caller ever sees the builder.
//   2. Feature gate. `api_access` is a per-tenant module; a platform admin can
//      switch it off and every key in that tenant must stop working at once.
//   3. Scopes. v1 is read-only. Every route requires the `read` scope; a key
//      minted with only `write` gets a 403 that names the missing scope.
//   4. Rate limit, keyed by key id rather than IP — integrators sit behind
//      shared egress, so per-IP limiting would punish the wrong party.
//
// Envelope: `{ data, page: { limit, offset, total } }` for lists, `{ data }`
// for single records, `{ error, code? }` for failures. Field exposure is by
// explicit whitelist in ./serializers.ts — internal notes, pricing metadata
// and the like are never selected, so they cannot leak by accident.

import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey, type ApiKeyContext } from '@/lib/supabase/require-api-key'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { featureGate } from '@/lib/supabase/require-feature'
import { checkRateLimitAsync, RATE_LIMITS } from '@/lib/rate-limit'
import { isValidUUID } from '@/lib/utils'

export const API_VERSION = 'v1' as const

export type Scope = 'read' | 'write'

export interface V1Context {
  key: ApiKeyContext
  tenantId: string
  supabase: ReturnType<typeof createServiceRoleClient>
}

export interface Page {
  limit: number
  offset: number
}

export const PAGE_DEFAULT = 50
export const PAGE_MAX = 200

/** Standard failure body. `code` is stable and machine-readable; `error` is for humans. */
export function apiError(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { error, code } : { error }, { status })
}

/**
 * Authenticate + authorize a v1 request. Returns either a ready context or the
 * response to send back — never both. Pass `null` for scope only on endpoints
 * that expose nothing but the key's own identity. Callers do:
 *
 *   const auth = await authorizeV1(req, 'read')
 *   if ('error' in auth) return auth.error
 *   const { ctx } = auth
 */
export async function authorizeV1(
  req: NextRequest,
  scope: Scope | null,
): Promise<{ error: NextResponse } | { ctx: V1Context }> {
  const keyed = await requireApiKey(req)
  if ('error' in keyed) return keyed
  const key = keyed.ctx

  // Per-key limit. RATE_LIMITS.api is the same budget the console gets.
  const rl = await checkRateLimitAsync(`v1:${key.keyId}`, RATE_LIMITS.api)
  if (!rl.allowed) {
    return { error: apiError(429, 'Rate limit exceeded. Try again shortly.', 'rate_limited') }
  }

  const gate = await featureGate(key.tenantId, 'api_access', 'API access')
  if (gate) return { error: gate }

  // scope === null: identity-only endpoints (/me) that any valid key may call.
  if (scope !== null && !key.scopes.includes(scope)) {
    return {
      error: apiError(403, `This key does not have the "${scope}" scope.`, 'insufficient_scope'),
    }
  }

  return { ctx: { key, tenantId: key.tenantId, supabase: createServiceRoleClient() } }
}

/** Parse ?limit= & ?offset= with the documented defaults and ceilings. */
export function parsePage(req: NextRequest): Page {
  const sp = req.nextUrl.searchParams
  const rawLimit = Number.parseInt(sp.get('limit') ?? '', 10)
  const rawOffset = Number.parseInt(sp.get('offset') ?? '', 10)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, PAGE_MAX) : PAGE_DEFAULT
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0
  return { limit, offset }
}

/** Parse an optional ISO-8601 query param; returns undefined if absent, null if malformed. */
export function parseIsoParam(req: NextRequest, name: string): string | null | undefined {
  const v = req.nextUrl.searchParams.get(name)
  if (v === null || v === '') return undefined
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** Reject an `id` path segment that is not a UUID before it reaches the DB. */
export function requireUuid(id: string): NextResponse | null {
  return isValidUUID(id) ? null : apiError(400, 'Invalid id: expected a UUID.', 'invalid_id')
}

/**
 * The ONLY way a v1 route may begin a tenant-scoped query. The service-role
 * client sees every tenant's rows; this pins the query to the key's tenant
 * before any filter, order or range the route adds.
 */
export function tenantQuery(ctx: V1Context, table: string, columns: string, opts?: { count?: 'exact' }) {
  return ctx.supabase.from(table).select(columns, opts).eq('tenant_id', ctx.tenantId)
}

/**
 * PostgREST's type inference gives up on a column list built at runtime and
 * types the row as GenericStringError. These are the only casts v1 makes, and
 * every row still goes through an explicit serializer whitelist afterwards.
 */
export type Row = Record<string, unknown>
export function asRows(data: unknown): Row[] {
  return Array.isArray(data) ? (data as Row[]) : []
}
export function asRow(data: unknown): Row | null {
  return data && typeof data === 'object' ? (data as Row) : null
}

export function listResponse<T>(data: T[], page: Page, total: number | null) {
  return NextResponse.json({ data, page: { limit: page.limit, offset: page.offset, total: total ?? data.length } })
}

export function itemResponse<T>(data: T) {
  return NextResponse.json({ data })
}
