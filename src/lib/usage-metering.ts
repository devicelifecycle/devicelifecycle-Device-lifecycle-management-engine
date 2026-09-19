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
 * Fire-and-forget increment. Never awaited by callers, never throws.
 * A supabase-js builder only sends once .then() is attached, so the handlers
 * below are what make this run at all.
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

/** Month-to-date event counts for one tenant (zeros when none). */
export async function monthUsage(tenantId: string): Promise<MonthUsage> {
  return (await monthUsageByTenant()).get(tenantId) ?? { api_calls: 0, ai_tokens: 0 }
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

export async function storageUsage(tenantId: string): Promise<StorageUsage> {
  return (await storageByTenant()).get(tenantId) ?? { bytes: 0, objects: 0 }
}

export const BYTES_PER_MB = 1024 * 1024
