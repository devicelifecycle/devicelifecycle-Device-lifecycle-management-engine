import { describe, it, expect } from 'vitest'
import {
  quoteConversionRate,
  deviceReceiptTimeDays,
  inspectionTurnaroundDays,
  gradeAdjustmentRate,
  customerDisputeRate,
  buildTradeInKpiSummary,
  type TriageRow,
} from '@/lib/trade-in-kpis'

describe('quoteConversionRate', () => {
  it('returns null when no order ever reached quoted', () => {
    expect(quoteConversionRate([{ status: 'draft' }, { status: 'submitted' }])).toBeNull()
  })

  it('computes % of quoted orders that were accepted or later', () => {
    expect(quoteConversionRate([
      { status: 'quoted' },
      { status: 'quoted' },
      { status: 'accepted' },
      { status: 'closed' },
    ])).toBe(50)
  })

  it('treats rejected quotes as not-converted', () => {
    expect(quoteConversionRate([{ status: 'quoted' }, { status: 'rejected' }])).toBe(0)
  })
})

describe('deviceReceiptTimeDays', () => {
  it('returns null with no complete pairs', () => {
    expect(deviceReceiptTimeDays([{ status: 'submitted', submitted_at: '2026-01-01', received_at: null }])).toBeNull()
  })

  it('averages whole days between submission and receipt', () => {
    expect(deviceReceiptTimeDays([
      { status: 'received', submitted_at: '2026-01-01T00:00:00Z', received_at: '2026-01-04T00:00:00Z' },
      { status: 'received', submitted_at: '2026-01-01T00:00:00Z', received_at: '2026-01-02T00:00:00Z' },
    ])).toBe(2)
  })

  it('ignores negative deltas (bad data) rather than skewing the average', () => {
    expect(deviceReceiptTimeDays([
      { status: 'received', submitted_at: '2026-01-05T00:00:00Z', received_at: '2026-01-01T00:00:00Z' },
    ])).toBeNull()
  })
})

describe('inspectionTurnaroundDays', () => {
  const row = (order_received_at: string | null, triaged_at: string | null): TriageRow => ({
    condition_changed: false, exception_required: false, exception_approved: null,
    exception_approved_by_role: null, triaged_at, order_received_at,
  })

  it('averages days from receipt to triage', () => {
    expect(inspectionTurnaroundDays([
      row('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
    ])).toBe(1)
  })

  it('returns null when nothing has been triaged yet', () => {
    expect(inspectionTurnaroundDays([row('2026-01-01T00:00:00Z', null)])).toBeNull()
  })
})

describe('gradeAdjustmentRate', () => {
  const row = (condition_changed: boolean): TriageRow => ({
    condition_changed, exception_required: false, exception_approved: null,
    exception_approved_by_role: null, triaged_at: null, order_received_at: null,
  })

  it('returns null with no triaged devices', () => {
    expect(gradeAdjustmentRate([])).toBeNull()
  })

  it('computes % of devices whose grade changed', () => {
    expect(gradeAdjustmentRate([row(true), row(false), row(false), row(false)])).toBe(25)
  })
})

describe('customerDisputeRate', () => {
  const row = (exception_approved: boolean | null, role: string | null): TriageRow => ({
    condition_changed: true, exception_required: true, exception_approved,
    exception_approved_by_role: role, triaged_at: null, order_received_at: null,
  })

  it('returns null when no offer was ever adjusted', () => {
    expect(customerDisputeRate([{
      condition_changed: false, exception_required: false, exception_approved: null,
      exception_approved_by_role: null, triaged_at: null, order_received_at: null,
    }])).toBeNull()
  })

  it('only counts customer-driven rejections as disputes, not COE/admin rejections', () => {
    expect(customerDisputeRate([
      row(false, 'customer'),
      row(false, 'coe_manager'),
      row(true, null),
      row(true, null),
    ])).toBe(25)
  })
})

describe('buildTradeInKpiSummary', () => {
  it('assembles all five metrics from pre-fetched rows', () => {
    const summary = buildTradeInKpiSummary(
      [{ status: 'accepted', submitted_at: '2026-01-01T00:00:00Z', received_at: '2026-01-03T00:00:00Z' }],
      [{ condition_changed: false, exception_required: false, exception_approved: null, exception_approved_by_role: null, triaged_at: null, order_received_at: null }],
    )
    expect(summary).toEqual({
      quoteConversionRatePct: 100,
      deviceReceiptTimeDays: 2,
      inspectionTurnaroundDays: null,
      gradeAdjustmentRatePct: 0,
      customerDisputeRatePct: null,
    })
  })
})
