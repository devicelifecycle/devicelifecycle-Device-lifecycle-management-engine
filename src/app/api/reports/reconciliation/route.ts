// ============================================================================
// DISCREPANCY RECONCILIATION REPORT API
// GET /api/reports/reconciliation?days=30&order_type=trade_in|cpo|all
// ============================================================================
// Returns a side-by-side view of:
//   Trade-In: customer claimed condition/value vs COE actual condition/adjustment
//   CPO:      vendor quoted price vs COE assessed value
// Restricted to internal roles only (admin, coe_manager, coe_tech, sales).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!profile || !['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const days = Math.min(parseInt(params.get('days') || '30'), 365)
    const orderTypeFilter = params.get('order_type') || 'all'
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // ── Fetch triage results with order + item + device context ─────────────
    const { data: triageRows, error: triageErr } = await supabase
      .from('triage_results')
      // triage_results has no order_item_id, claimed_condition or
      // actual_condition, and no FK to order_items — this select named four
      // things that do not exist, so PostgREST rejected the whole query and
      // this report answered 500 every time it was opened. It links to the
      // device through imei_record_id; the claimed condition lives on
      // imei_records and the triage outcome is final_condition. Same shape
      // exception.service.ts already uses (verified live).
      .select(`
        id,
        order_id,
        price_adjustment,
        mismatch_severity,
        approval_status,
        created_at,
        imei_record:imei_records(
          order_item_id,
          claimed_condition,
          order_item:order_items(
            quantity,
            storage,
            unit_price,
            guaranteed_buyback_price,
            device:device_catalog(make, model)
          )
        ),
        orders!inner(
          order_number,
          type,
          status,
          customers(company_name),
          vendors(company_name)
        )
      `)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (triageErr) {
      console.error('[reconciliation] triage query error:', triageErr)
      return NextResponse.json({ error: 'Failed to load reconciliation data' }, { status: 500 })
    }

    type OrderItemRow = {
      quantity: number | null
      storage: string | null
      unit_price: number | null
      guaranteed_buyback_price: number | null
      device: { make: string; model: string } | { make: string; model: string }[] | null
    }
    type TriageRow = {
      id: string
      order_id: string
      final_condition: string | null
      price_adjustment: number | null
      mismatch_severity: string | null
      approval_status: string | null
      created_at: string
      imei_record: {
        order_item_id: string | null
        claimed_condition: string | null
        order_item: OrderItemRow | OrderItemRow[] | null
      } | {
        order_item_id: string | null
        claimed_condition: string | null
        order_item: OrderItemRow | OrderItemRow[] | null
      }[] | null
      orders: {
        order_number: string | null
        type: string | null
        status: string | null
        customers: { company_name: string } | null
        vendors: { company_name: string } | null
      } | null
    }

    const rows = (triageRows || []) as unknown as TriageRow[]

    // ── Filter by order type if requested ───────────────────────────────────
    const filtered = rows.filter(r => {
      if (orderTypeFilter === 'trade_in') return r.orders?.type === 'trade_in'
      if (orderTypeFilter === 'cpo') return r.orders?.type === 'cpo'
      return true
    })

    // ── Build line items ─────────────────────────────────────────────────────
    // PostgREST returns a to-one embed as an object, but the generated types
    // widen it to a possible array; unwrap once rather than at each use.
    const one = <T,>(v: T | T[] | null | undefined): T | null =>
      (Array.isArray(v) ? v[0] ?? null : v ?? null)

    const items = filtered.map(r => {
      const order = r.orders
      const rec = one(r.imei_record)
      const item = one(rec?.order_item)
      const device = one(item?.device)
      const claimedCondition = rec?.claimed_condition ?? null
      const actualCondition = r.final_condition ?? null
      const isCpo = order?.type === 'cpo'

      const claimedValue = isCpo
        ? (item?.guaranteed_buyback_price ?? item?.unit_price ?? 0)
        : (item?.unit_price ?? 0)
      const adjustment = r.price_adjustment ?? 0
      const coeValue = claimedValue + adjustment

      return {
        id: r.id,
        order_number: order?.order_number ?? '—',
        order_type: order?.type ?? 'unknown',
        order_status: order?.status ?? 'unknown',
        counterparty: isCpo
          ? (order?.vendors?.company_name ?? '—')
          : (order?.customers?.company_name ?? '—'),
        counterparty_label: isCpo ? 'Vendor' : 'Customer',
        device: device ? `${device.make} ${device.model}`.trim() : '—',
        storage: item?.storage ?? '—',
        quantity: item?.quantity ?? 1,
        claimed_condition: claimedCondition ?? '—',
        actual_condition: actualCondition ?? '—',
        // Only a difference between two KNOWN conditions is a change; an
        // unknown on either side is not evidence of one.
        condition_changed: claimedCondition !== null && actualCondition !== null
          && claimedCondition !== actualCondition,
        claimed_value: claimedValue,
        coe_value: coeValue,
        price_adjustment: adjustment,
        mismatch_severity: r.mismatch_severity ?? 'minor',
        approval_status: r.approval_status ?? 'pending',
        created_at: r.created_at,
      }
    })

    // ── Aggregate summary ────────────────────────────────────────────────────
    const tradeInItems = items.filter(i => i.order_type === 'trade_in')
    const cpoItems = items.filter(i => i.order_type === 'cpo')

    const sumAdj = (arr: typeof items) =>
      arr.reduce((s, i) => s + (i.price_adjustment * (i.quantity ?? 1)), 0)

    const countByStatus = (arr: typeof items, status: string) =>
      arr.filter(i => i.approval_status === status).length

    const summary = {
      total_exceptions: items.length,
      condition_mismatches: items.filter(i => i.condition_changed).length,
      pending: items.filter(i => ['pending', 'coe_approved'].includes(i.approval_status)).length,
      resolved: items.filter(i => ['admin_approved', 'overridden', 'rejected'].includes(i.approval_status)).length,
      total_value_adjustment: sumAdj(items),
      by_type: {
        trade_in: {
          count: tradeInItems.length,
          total_adjustment: sumAdj(tradeInItems),
          pending: countByStatus(tradeInItems, 'pending'),
          approved: tradeInItems.filter(i => ['admin_approved', 'overridden'].includes(i.approval_status)).length,
        },
        cpo: {
          count: cpoItems.length,
          total_adjustment: sumAdj(cpoItems),
          pending: countByStatus(cpoItems, 'pending'),
          approved: cpoItems.filter(i => ['admin_approved', 'overridden'].includes(i.approval_status)).length,
        },
      },
      by_severity: {
        minor: items.filter(i => i.mismatch_severity === 'minor').length,
        moderate: items.filter(i => i.mismatch_severity === 'moderate').length,
        major: items.filter(i => i.mismatch_severity === 'major').length,
      },
    }

    return NextResponse.json({ period_days: days, summary, items })
  } catch (error) {
    console.error('[reconciliation]', error)
    return NextResponse.json({ error: 'Failed to generate reconciliation report' }, { status: 500 })
  }
}
