import { describe, it, expect } from 'vitest'
import { canTransitionTicket, isOpenStatus, TICKET_STATUSES } from '@/lib/tickets'

describe('ticket status machine', () => {
  it('allows the expected forward transitions', () => {
    expect(canTransitionTicket('open', 'in_progress')).toBe(true)
    expect(canTransitionTicket('in_progress', 'resolved')).toBe(true)
    expect(canTransitionTicket('resolved', 'closed')).toBe(true)
  })

  it('allows reopening resolved/closed', () => {
    expect(canTransitionTicket('resolved', 'open')).toBe(true)
    expect(canTransitionTicket('closed', 'open')).toBe(true)
  })

  it('rejects illegal jumps', () => {
    expect(canTransitionTicket('open', 'open')).toBe(false)
    expect(canTransitionTicket('closed', 'resolved')).toBe(false)
    expect(canTransitionTicket('resolved', 'in_progress')).toBe(false)
  })

  it('classifies open vs terminal', () => {
    expect(isOpenStatus('open')).toBe(true)
    expect(isOpenStatus('in_progress')).toBe(true)
    expect(isOpenStatus('resolved')).toBe(false)
    expect(isOpenStatus('closed')).toBe(false)
  })

  it('has four statuses', () => {
    expect(TICKET_STATUSES).toHaveLength(4)
  })
})
