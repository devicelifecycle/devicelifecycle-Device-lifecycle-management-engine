// ============================================================================
// ORDER CREATION GATE — per-tenant module + monthly-transaction limits
// ============================================================================
// One implementation for every path that creates an order. It used to live
// inline in POST /api/orders only; the CSV upload path (the primary bulk
// path) created orders with no gate at all, so a VAR with trade-in switched
// off or its monthly transaction cap reached could still create orders by
// uploading a file. Found 2026-09-19.
//
// No-op for the platform tenant (core modules on, transactions unlimited by
// default). Fails CLOSED on a lookup error — a quota check we can't complete
// must never silently let the request through, or the limit is bypassable by
// making the lookup fail.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { tenantLimits } from '@/lib/tenant-limits'
import { featureBlockMessage, quotaBlockMessage } from '@/lib/quota'

/** A "transaction" for quota purposes is one order created in the calendar month (UTC). */
export function monthStartUtc(now: Date = new Date()): string {
  const d = new Date(now)
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Returns a response to send when the tenant may NOT create this order, else
 * null. `count` is how many orders this request will create (CSV = 1 order).
 */
export async function orderCreationGate(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
  orderType: 'trade_in' | 'cpo',
  count = 1,
): Promise<NextResponse | null> {
  if (!tenantId) return null
  try {
    const { data: tenant, error } = await supabase.from('tenants').select('settings').eq('id', tenantId).maybeSingle()
    if (error) throw error
    const { license, features } = tenantLimits(tenant?.settings)
    const isCpo = orderType === 'cpo'
    const fBlock = featureBlockMessage(features, isCpo ? 'cpo' : 'trade_in', isCpo ? 'CPO' : 'Trade-In')
    if (fBlock) return NextResponse.json({ error: fBlock }, { status: 403 })
    if (license.transactionsPerMonth >= 0) {
      const { count: used, error: cErr } = await supabase
        .from('orders').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).gte('created_at', monthStartUtc())
      if (cErr) throw cErr
      const qBlock = quotaBlockMessage(license.transactionsPerMonth, used ?? 0, count, 'Transactions this month')
      if (qBlock) return NextResponse.json({ error: qBlock }, { status: 403 })
    }
    return null
  } catch (err) {
    console.error('Order creation gate failed — blocking to avoid a limit bypass:', err)
    return NextResponse.json({ error: 'Could not verify plan limits. Please try again in a moment.' }, { status: 503 })
  }
}
