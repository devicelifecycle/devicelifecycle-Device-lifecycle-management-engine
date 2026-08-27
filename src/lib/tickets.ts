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

/** Target resolution window (hours) per priority, used to set ticket SLA due time. */
export const TICKET_SLA_HOURS: Record<TicketPriority, number> = {
  low: 72,
  normal: 24,
  high: 8,
  urgent: 2,
}

export type SlaState = 'on_track' | 'due_soon' | 'breached' | 'met'

/**
 * Derive a ticket's SLA state from its status + due time. Resolved/closed
 * tickets are considered "met". Open tickets past `sla_due_at` are "breached";
 * those inside the final 25% of their window are "due_soon".
 */
export function ticketSlaState(ticket: {
  status: TicketStatus
  sla_due_at: string | null
  created_at: string
}): SlaState {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return 'met'
  if (!ticket.sla_due_at) return 'on_track'
  const due = new Date(ticket.sla_due_at).getTime()
  const now = Date.now()
  if (now > due) return 'breached'
  const window = due - new Date(ticket.created_at).getTime()
  if (window > 0 && now > due - window * 0.25) return 'due_soon'
  return 'on_track'
}
