// ============================================================================
// TENANT USAGE METERING — record + read API calls, AI tokens, storage
// ============================================================================
// Runtime source for the `apiCallsPerMonth` and `storageMb` license limits and
// for the Storage / API usage columns of the platform report, which showed
// "Not yet metered" until 2026-09-19. Backed by 20260919000000_tenant_usage_metering.sql.
// (./usage.ts is the pure "counts vs limits" report builder; this is the I/O.)
//
// Events (API calls, AI tokens) are counted through an atomic upsert RPC and
// recorded fire-and-forget — metering must never slow down or fail the request
// it measures. Storage is MEASURED from storage.objects at read time, never
// counted, so re-uploads and deletes cannot drift it.

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface UsageEvent {
  apiCalls?: number
  aiTokens?: number
}

/**
 * Awaited increment, for the callers where the counter GATES a quota (/api/v1).
 * A count dropped by serverless teardown there would let a tenant drift past
 * its limit and under-report on the bill, so this one is worth the round-trip.
 */
export async function recordUsageNow(tenantId: string | null | undefined, ev: UsageEvent): Promise<void> {
  if (!tenantId) return
  const apiCalls = Math.max(0, Math.floor(ev.apiCalls ?? 0))
  const aiTokens = Math.max(0, Math.floor(ev.aiTokens ?? 0))
  if (apiCalls === 0 && aiTokens === 0) return
  const { error } = await createServiceRoleClient()
    .rpc('increment_tenant_usage', { p_tenant_id: tenantId, p_api_calls: apiCalls, p_ai_tokens: aiTokens })
  if (error) throw new Error(`usage: increment failed: ${error.message}`)
}

/**
 * Fire-and-forget increment, for metering that gates nothing (the AI
 * assistant). Never awaited, never throws. A supabase-js builder only sends
 * once .then() is attached, so the handlers below are what make this run.
 */
export function recordUsage(tenantId: string | null | undefined, ev: UsageEvent): void {
  if (!tenantId) return
  const apiCalls = Math.max(0, Math.floor(ev.apiCalls ?? 0))
  const aiTokens = Math.max(0, Math.floor(ev.aiTokens ?? 0))
  if (apiCalls === 0 && aiTokens === 0) return
  try {
    createServiceRoleClient()
      .rpc('increment_tenant_usage', { p_tenant_id: tenantId, p_api_calls: apiCalls, p_ai_tokens: aiTokens })
      .then(
        ({ error }) => { if (error) console.warn('usage: increment failed', error.message) },
        (err: unknown) => console.warn('usage: increment threw', err),
      )
  } catch (err) {
    console.warn('usage: could not start increment', err)
  }
}

export interface MonthUsage { api_calls: number; ai_tokens: number }

/** Month-to-date event counts for every tenant with any usage. */
export async function monthUsageByTenant(): Promise<Map<string, MonthUsage>> {
  const { data, error } = await createServiceRoleClient().rpc('tenant_usage_month')
  if (error) throw new Error(`usage: month rollup failed: ${error.message}`)
  const out = new Map<string, MonthUsage>()
  for (const r of (data ?? []) as { tenant_id: string; api_calls: number; ai_tokens: number }[]) {
    out.set(r.tenant_id, { api_calls: Number(r.api_calls), ai_tokens: Number(r.ai_tokens) })
  }
  return out
}

/**
 * Month-to-date event counts for ONE tenant.
 *
 * Goes through a single-tenant RPC rather than the platform-wide rollup: this
 * runs on every authenticated /api/v1 call, and asking for every tenant's
 * totals to read one tenant's counter made the cost of a quota check grow with
 * the number of VARs on the platform.
 */
export async function monthUsage(tenantId: string): Promise<MonthUsage> {
  const { data, error } = await createServiceRoleClient()
    .rpc('tenant_usage_month_one', { p_tenant_id: tenantId })
  if (error) throw new Error(`usage: month lookup failed: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return {
    api_calls: Number((row as { api_calls?: number } | null)?.api_calls ?? 0),
    ai_tokens: Number((row as { ai_tokens?: number } | null)?.ai_tokens ?? 0),
  }
}

export interface StorageUsage { bytes: number; objects: number }

/** Bytes currently held in the uploads bucket, per tenant, measured from storage.objects. */
export async function storageByTenant(): Promise<Map<string, StorageUsage>> {
  const { data, error } = await createServiceRoleClient().rpc('tenant_storage_bytes')
  if (error) throw new Error(`usage: storage measure failed: ${error.message}`)
  const out = new Map<string, StorageUsage>()
  for (const r of (data ?? []) as { tenant_id: string; bytes: number; objects: number }[]) {
    out.set(r.tenant_id, { bytes: Number(r.bytes), objects: Number(r.objects) })
  }
  return out
}

/** Bytes held by ONE tenant — single-tenant RPC, for the same reason as above. */
export async function storageUsage(tenantId: string): Promise<StorageUsage> {
  const { data, error } = await createServiceRoleClient()
    .rpc('tenant_storage_bytes_one', { p_tenant_id: tenantId })
  if (error) throw new Error(`usage: storage lookup failed: ${error.message}`)
  return { bytes: Number(data ?? 0), objects: 0 }
}

export const BYTES_PER_MB = 1024 * 1024
