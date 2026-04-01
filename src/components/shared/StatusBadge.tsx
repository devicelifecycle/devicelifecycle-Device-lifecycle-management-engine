// Premium ring-based status badge — Linear / Vercel / GitHub style

import { cn } from '@/lib/utils'
import type { OrderStatus } from '@/types'

// Ring-based badge classes per status
const STATUS_BADGE: Record<string, string> = {
  // Order statuses
  draft:          'bg-stone-100  text-stone-600  ring-1 ring-inset ring-stone-400/25',
  submitted:      'bg-blue-50    text-blue-700   ring-1 ring-inset ring-blue-600/20',
  quoted:         'bg-violet-50  text-violet-700 ring-1 ring-inset ring-violet-600/20',
  accepted:       'bg-sky-50     text-sky-700    ring-1 ring-inset ring-sky-600/20',
  rejected:       'bg-red-50     text-red-700    ring-1 ring-inset ring-red-600/20',
  sourcing:       'bg-amber-50   text-amber-700  ring-1 ring-inset ring-amber-600/20',
  sourced:        'bg-amber-50   text-amber-800  ring-1 ring-inset ring-amber-700/25',
  shipped_to_coe: 'bg-indigo-50  text-indigo-700 ring-1 ring-inset ring-indigo-600/20',
  received:       'bg-cyan-50    text-cyan-700   ring-1 ring-inset ring-cyan-600/20',
  in_triage:      'bg-orange-50  text-orange-700 ring-1 ring-inset ring-orange-600/20',
  qc_complete:    'bg-teal-50    text-teal-700   ring-1 ring-inset ring-teal-600/20',
  ready_to_ship:  'bg-lime-50    text-lime-700   ring-1 ring-inset ring-lime-600/20',
  shipped:        'bg-blue-50    text-blue-700   ring-1 ring-inset ring-blue-600/20',
  delivered:      'bg-green-50   text-green-700  ring-1 ring-inset ring-green-600/20',
  closed:         'bg-stone-100  text-stone-500  ring-1 ring-inset ring-stone-400/20',
  cancelled:      'bg-stone-100  text-stone-500  ring-1 ring-inset ring-stone-400/20',
  // Generic
  active:         'bg-green-50   text-green-700  ring-1 ring-inset ring-green-600/20',
  inactive:       'bg-stone-100  text-stone-500  ring-1 ring-inset ring-stone-400/20',
  pending:        'bg-amber-50   text-amber-700  ring-1 ring-inset ring-amber-600/20',
  error:          'bg-red-50     text-red-700    ring-1 ring-inset ring-red-600/20',
  success:        'bg-green-50   text-green-700  ring-1 ring-inset ring-green-600/20',
  warning:        'bg-amber-50   text-amber-700  ring-1 ring-inset ring-amber-600/20',
  info:           'bg-blue-50    text-blue-700   ring-1 ring-inset ring-blue-600/20',
}

const DEFAULT_BADGE = 'bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-400/20'

interface StatusBadgeProps {
  status: string
  label?: string
  className?: string
  dot?: boolean
}

export function StatusBadge({ status, label, className, dot = false }: StatusBadgeProps) {
  const badgeClass = STATUS_BADGE[status.toLowerCase()] ?? DEFAULT_BADGE

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        badgeClass,
        className
      )}
    >
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
      )}
      {label ?? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  )
}

export default StatusBadge
