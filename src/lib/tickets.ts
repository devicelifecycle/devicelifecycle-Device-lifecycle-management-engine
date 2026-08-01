// ============================================================================
// SUPPORT TICKETS — status + priority model
// ============================================================================

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

// open → work it or close; resolved/closed can be reopened.
const NEXT: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed', 'open'],
  resolved: ['closed', 'open'],
  closed: ['open'],
}

export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  return NEXT[from]?.includes(to) ?? false
}

export function isOpenStatus(s: TicketStatus): boolean {
  return s === 'open' || s === 'in_progress'
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed',
}
