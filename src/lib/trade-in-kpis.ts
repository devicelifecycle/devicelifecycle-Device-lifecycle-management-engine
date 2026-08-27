// ============================================================================
// TRADE-IN QUOTE PROCESS KPIs — client-specified service-level metrics
// ============================================================================
// Pure functions behind /api/admin/reports/operations. Source: "BB Trade In
// Quote process Aug 27" client spec, section 3 (Service Levels and KPIs).
// These are outcome/quality metrics, distinct from the response-time SLA
// targets tracked by sla.service.ts. Two metrics from that spec — Recovery
// value and Settlement accuracy — need disposition-routing and settlement
// data that doesn't exist in the schema yet, so they're deliberately absent
// here rather than faked; the route surfaces them as "Not yet tracked".

/** Trade-in orders reaching each milestone within the reporting window. */
export interface TradeInOrderRow {
  status: string
  submitted_at: string | null
  received_at: string | null
}

export interface TriageRow {
  condition_changed: boolean | null
  exception_required: boolean | null
  exception_approved: boolean | null
  exception_approved_by_role: string | null
  triaged_at: string | null
  order_received_at: string | null
}

/** Statuses that mean the customer accepted the quote (or moved further). */
const ACCEPTED_OR_LATER = new Set([
  'accepted', 'sourcing', 'sourced', 'shipped_to_coe', 'received',
  'triage', 'triage_complete', 'approved', 'closed',
])
/** Statuses that mean a quote was actually produced. */
const QUOTED_OR_LATER = new Set([...ACCEPTED_OR_LATER, 'quoted'])

/**
 * Quote-to-submission conversion — % of quoted trade-in orders that the
 * customer went on to accept. Null (not a percentage) when no order in the
 * window ever reached 'quoted', so a report with zero quotes reads as
 * "no data" rather than a misleading 0%.
 */
export function quoteConversionRate(orders: Array<{ status: string }>): number | null {
  const quoted = orders.filter((o) => QUOTED_OR_LATER.has(o.status))
  if (quoted.length === 0) return null
  const accepted = quoted.filter((o) => ACCEPTED_OR_LATER.has(o.status))
  return Math.round((accepted.length / quoted.length) * 1000) / 10
}

/** Average whole days between two ISO timestamps; null pairs are skipped. */
function avgDaysBetween(pairs: Array<{ start: string | null; end: string | null }>): number | null {
  const deltas = pairs
    .filter((p) => p.start && p.end)
    .map((p) => (new Date(p.end as string).getTime() - new Date(p.start as string).getTime()) / 86_400_000)
    .filter((d) => d >= 0)
  if (deltas.length === 0) return null
  return Math.round((deltas.reduce((s, d) => s + d, 0) / deltas.length) * 10) / 10
}

/** Device receipt time — avg days from customer submission to device arrival. */
export function deviceReceiptTimeDays(orders: TradeInOrderRow[]): number | null {
  return avgDaysBetween(orders.map((o) => ({ start: o.submitted_at, end: o.received_at })))
}

/** Inspection turnaround time — avg days from device receipt to final grade/value confirmation. */
export function inspectionTurnaroundDays(rows: TriageRow[]): number | null {
  return avgDaysBetween(rows.map((r) => ({ start: r.order_received_at, end: r.triaged_at })))
}

/** Grade adjustment rate — % of inspected devices whose final grade differed from the initial estimate. */
export function gradeAdjustmentRate(rows: TriageRow[]): number | null {
  if (rows.length === 0) return null
  const adjusted = rows.filter((r) => r.condition_changed === true)
  return Math.round((adjusted.length / rows.length) * 1000) / 10
}

/**
 * Customer dispute rate — % of adjusted offers where the customer themselves
 * rejected the revised (exception) quote, as opposed to COE/admin resolving
 * it. Denominator is every device that actually required an exception
 * (an "adjusted offer"), not every device inspected.
 */
export function customerDisputeRate(rows: TriageRow[]): number | null {
  const adjustedOffers = rows.filter((r) => r.exception_required === true)
  if (adjustedOffers.length === 0) return null
  const disputed = adjustedOffers.filter((r) => r.exception_approved === false && r.exception_approved_by_role === 'customer')
  return Math.round((disputed.length / adjustedOffers.length) * 1000) / 10
}

export interface TradeInKpiSummary {
  quoteConversionRatePct: number | null
  deviceReceiptTimeDays: number | null
  inspectionTurnaroundDays: number | null
  gradeAdjustmentRatePct: number | null
  customerDisputeRatePct: number | null
}

/** Assemble the full KPI summary from pre-fetched rows. */
export function buildTradeInKpiSummary(orders: TradeInOrderRow[], triage: TriageRow[]): TradeInKpiSummary {
  return {
    quoteConversionRatePct: quoteConversionRate(orders),
    deviceReceiptTimeDays: deviceReceiptTimeDays(orders),
    inspectionTurnaroundDays: inspectionTurnaroundDays(triage),
    gradeAdjustmentRatePct: gradeAdjustmentRate(triage),
    customerDisputeRatePct: customerDisputeRate(triage),
  }
}
