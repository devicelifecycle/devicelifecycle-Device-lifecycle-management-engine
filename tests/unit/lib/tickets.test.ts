import { describe, it, expect } from 'vitest'
import { canTransitionTicket, ticketSlaState } from '@/lib/tickets'

describe('canTransitionTicket', () => {
  it('open can move to in_progress, resolved, or closed', () => {
    expect(canTransitionTicket('open', 'in_progress')).toBe(true)
    expect(canTransitionTicket('open', 'resolved')).toBe(true)
    expect(canTransitionTicket('open', 'closed')).toBe(true)
  })
  it('closed can only reopen', () => {
    expect(canTransitionTicket('closed', 'open')).toBe(true)
    expect(canTransitionTicket('closed', 'in_progress')).toBe(false)
  })
})

describe('ticketSlaState', () => {
  const created_at = new Date().toISOString()

  it('open ticket well within its window is on_track', () => {
    expect(ticketSlaState({
      status: 'open', created_at,
      sla_due_at: new Date(Date.now() + 100_000_000).toISOString(),
    })).toBe('on_track')
  })

  it('open ticket past its due time is breached', () => {
    expect(ticketSlaState({
      status: 'open', created_at,
      sla_due_at: new Date(Date.now() - 1000).toISOString(),
    })).toBe('breached')
  })

  it('resolved ticket with no resolved_at recorded is met (back-compat)', () => {
    expect(ticketSlaState({
      status: 'resolved', created_at,
      sla_due_at: new Date(Date.now() - 1000).toISOString(),
      resolved_at: null,
    })).toBe('met')
  })

  it('resolved before the due time is met', () => {
    const sla_due_at = '2026-01-02T00:00:00.000Z'
    expect(ticketSlaState({
      status: 'resolved', created_at, sla_due_at,
      resolved_at: '2026-01-01T12:00:00.000Z',
    })).toBe('met')
  })

  it('resolved after the due time stays breached, not met', () => {
    const sla_due_at = '2026-01-02T00:00:00.000Z'
    expect(ticketSlaState({
      status: 'closed', created_at, sla_due_at,
      resolved_at: '2026-01-03T00:00:00.000Z',
    })).toBe('breached')
  })
})
