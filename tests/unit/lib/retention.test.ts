import { describe, it, expect } from 'vitest'
import {
  RETENTION_TARGETS, RETENTION_KEYS, RETENTION_MIN_DAYS, RETENTION_MAX_DAYS,
  resolveRetentionPolicy, retentionCutoff, effectiveDays,
} from '@/lib/retention'

describe('resolveRetentionPolicy', () => {
  it('defaults every class to null (keep forever) when nothing is stored', () => {
    const p = resolveRetentionPolicy(undefined)
    for (const k of RETENTION_KEYS) expect(p[k]).toBeNull()
    expect(Object.keys(p).sort()).toEqual([...RETENTION_KEYS].sort())
  })

  it('keeps valid integers and drops everything else back to null rather than clamping', () => {
    const p = resolveRetentionPolicy({
      audit_logs: 365,
      notifications: RETENTION_MIN_DAYS,
      notification_attempts: RETENTION_MAX_DAYS,
      order_timeline: 3,            // below floor — a typo, not a policy
      sla_breaches: 99999,          // above ceiling
      impersonation_log: '90',      // wrong type
      not_a_class: 30,              // unknown key ignored
    })
    expect(p.audit_logs).toBe(365)
    expect(p.notifications).toBe(RETENTION_MIN_DAYS)
    expect(p.notification_attempts).toBe(RETENTION_MAX_DAYS)
    expect(p.order_timeline).toBeNull()
    expect(p.sla_breaches).toBeNull()
    expect(p.impersonation_log).toBeNull()
    expect(p).not.toHaveProperty('not_a_class')
  })

  it('rejects non-integers and non-objects', () => {
    expect(resolveRetentionPolicy({ audit_logs: 90.5 }).audit_logs).toBeNull()
    expect(resolveRetentionPolicy('365').audit_logs).toBeNull()
    expect(resolveRetentionPolicy(null).audit_logs).toBeNull()
  })
})

describe('retentionCutoff', () => {
  it('is exactly N days before now, in ISO UTC', () => {
    const now = new Date('2026-09-18T12:00:00.000Z')
    expect(retentionCutoff(30, now)).toBe('2026-08-19T12:00:00.000Z')
    expect(retentionCutoff(365, now)).toBe('2025-09-18T12:00:00.000Z')
  })
})

describe('effectiveDays', () => {
  it('override wins, then policy, then nothing', () => {
    expect(effectiveDays(365, 90)).toBe(90)
    expect(effectiveDays(365, null)).toBe(365)
    expect(effectiveDays(null, 90)).toBe(90)
    expect(effectiveDays(null, null)).toBeNull()
  })
})

describe('RETENTION_TARGETS', () => {
  // The timestamp column names were verified against the live database on
  // 2026-09-18. audit_logs is the odd one out (`timestamp`); pin it so a
  // "tidy-up" to created_at cannot silently turn its count into an error.
  it('names the verified timestamp column per table', () => {
    const cols = Object.fromEntries(RETENTION_TARGETS.map((t) => [t.table, t.tsColumn]))
    expect(cols).toEqual({
      audit_logs: 'timestamp',
      notifications: 'created_at',
      notification_attempts: 'created_at',
      order_timeline: 'created_at',
      sla_breaches: 'created_at',
      impersonation_log: 'ended_at',
    })
  })

  it('never targets a business-record table', () => {
    const tables = RETENTION_TARGETS.map((t) => t.table as string)
    for (const forbidden of ['orders', 'order_items', 'customers', 'invoices', 'customer_assets', 'triage_results', 'users', 'tenants']) {
      expect(tables).not.toContain(forbidden)
    }
  })
})
