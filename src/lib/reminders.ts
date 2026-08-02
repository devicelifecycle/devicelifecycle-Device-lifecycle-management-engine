// ============================================================================
// CUSTOMER REMINDERS — scheduling helpers
// ============================================================================
// Resellers schedule reminders that go out to customers under the reseller's
// name. Pure helpers decide what's due; a cron sends them via the notification
// service later.

export interface Reminder {
  id: string
  due_at: string | Date
  sent_at: string | Date | null
}

/** A reminder is due when its time has passed and it hasn't been sent. */
export function isDue(reminder: Pick<Reminder, 'due_at' | 'sent_at'>, now: Date = new Date()): boolean {
  if (reminder.sent_at) return false
  const due = new Date(reminder.due_at).getTime()
  return Number.isFinite(due) && due <= now.getTime()
}

/** All reminders that should be sent right now. */
export function dueReminders<T extends Pick<Reminder, 'due_at' | 'sent_at'>>(list: T[], now: Date = new Date()): T[] {
  return list.filter((r) => isDue(r, now))
}

/** Validate a scheduled time: must parse and not be in the past (with a small grace). */
export function isValidDueDate(value: string, now: Date = new Date()): boolean {
  const t = new Date(value).getTime()
  return Number.isFinite(t) && t >= now.getTime() - 60_000
}
