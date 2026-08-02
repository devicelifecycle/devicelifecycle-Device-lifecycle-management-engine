import { describe, it, expect } from 'vitest'
import { isDue, dueReminders, isValidDueDate } from '@/lib/reminders'

const NOW = new Date('2026-08-02T12:00:00Z')
const past = '2026-08-01T12:00:00Z'
const future = '2026-08-03T12:00:00Z'

describe('reminders', () => {
  it('a past, unsent reminder is due', () => {
    expect(isDue({ due_at: past, sent_at: null }, NOW)).toBe(true)
  })
  it('a future reminder is not due', () => {
    expect(isDue({ due_at: future, sent_at: null }, NOW)).toBe(false)
  })
  it('an already-sent reminder is never due', () => {
    expect(isDue({ due_at: past, sent_at: past }, NOW)).toBe(false)
  })
  it('dueReminders returns only the ones to send now', () => {
    const list = [
      { id: '1', due_at: past, sent_at: null },
      { id: '2', due_at: future, sent_at: null },
      { id: '3', due_at: past, sent_at: past },
    ]
    expect(dueReminders(list, NOW).map((r) => r.id)).toEqual(['1'])
  })
  it('validates the scheduled time (not in the past, must parse)', () => {
    expect(isValidDueDate(future, NOW)).toBe(true)
    expect(isValidDueDate(past, NOW)).toBe(false)
    expect(isValidDueDate('not-a-date', NOW)).toBe(false)
  })
})
