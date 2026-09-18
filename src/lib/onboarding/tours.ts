// ============================================================================
// ONBOARDING TOUR CONTENT
// ============================================================================
// Step targets are existing layout elements tagged with data-tour="..." in
// Sidebar.tsx / Header.tsx / ChatAssistant.tsx — never page-specific content,
// so every step's target exists on every dashboard page regardless of where
// the user lands after login. Keeps the tour robust without needing to
// auto-navigate the user mid-tour.

import type { AppRole } from '@/types'

export interface TourStep {
  target: string // matches a data-tour="..." attribute
  title: string
  description: string
  /** Which side of the target the callout card prefers — falls back if there's no room. */
  placement?: 'bottom' | 'top' | 'left' | 'right'
}

const COMMON_INTRO: TourStep = {
  target: 'sidebar-nav',
  title: 'Your navigation',
  description: 'Everything you can do lives here, grouped by what stage of work it belongs to. It only shows what\'s relevant to your role.',
  placement: 'right',
}

const COMMON_OUTRO: TourStep[] = [
  {
    target: 'notifications',
    title: 'Notifications',
    description: 'Order updates, exceptions, and anything needing your attention land here automatically — no need to refresh or check manually.',
    placement: 'bottom',
  },
  {
    target: 'chat-assistant',
    title: 'Your AI assistant',
    description: 'Ask it about orders, pricing, or devices any time. It actually adapts to whatever page you\'re on — for example it becomes a bid-comparison specialist on the Bids page.',
    placement: 'left',
  },
  {
    target: 'account-menu',
    title: 'Your account',
    description: 'Profile settings and sign-out live here.',
    placement: 'bottom',
  },
]

// Keyed by AppRole, NOT UserRole. users.role genuinely holds the delegated VAR
// roles (migration 20260818000000 added them to the Postgres enum), but these
// maps only covered the 6 core roles — so a VAR user's first login looked up
// `undefined` and the tour threw while rendering. Because it renders from the
// dashboard LAYOUT, (dashboard)/error.tsx could not catch it and there is no
// root error.tsx, so it took the whole page down, and since the tour never
// finished, onboarding_completed_at stayed null and it crashed again on every
// subsequent login. Keep every AppRole covered here; the lookups below are
// also made total so a future role can never reintroduce the crash.
const ROLE_SPECIFIC_STEP: Record<AppRole, TourStep> = {
  admin: {
    target: 'nav-users',
    title: 'Run the platform',
    description: 'User accounts, organizations, pricing rules, and SLA thresholds are all managed from the Control section.',
    placement: 'right',
  },
  coe_manager: {
    target: 'nav-triage',
    title: 'Your team\'s queue',
    description: 'Triage is where devices get inspected and graded against what the customer claimed. You\'ll oversee exceptions and backlog from here.',
    placement: 'right',
  },
  coe_tech: {
    target: 'nav-triage',
    title: 'Your workbench',
    description: 'This is where you\'ll spend most of your time — inspecting devices, checking IMEI/battery health, and grading condition.',
    placement: 'right',
  },
  sales: {
    target: 'nav-orders',
    title: 'Your pipeline',
    description: 'Every order you create or get assigned shows up here. You can set prices and send quotes directly from an order.',
    placement: 'right',
  },
  customer: {
    target: 'nav-my-orders',
    title: 'Your orders',
    description: 'Track every trade-in or request you\'ve submitted, see quotes as they arrive, and accept or decline right from here.',
    placement: 'right',
  },
  vendor: {
    target: 'nav-vendor-orders',
    title: 'Your fulfillment queue',
    description: 'Orders assigned to you show up here. Check My Bids to track open opportunities you can bid on.',
    placement: 'right',
  },
  var_entity_admin: {
    target: 'nav-var-customers',
    title: 'Your organization',
    description: 'You run your whole organization here — your customer book, your team and their regions, and roll-up reporting across every rep.',
    placement: 'right',
  },
  // Each role targets a nav item that role can actually SEE — /var/customers is
  // entity-admin only, so pointing a regional manager or rep at it would leave
  // them staring at a step whose target silently never appears.
  var_regional_manager: {
    target: 'nav-var-team',
    title: 'Your region',
    description: 'You manage the sales reps in your own region here, and Reports rolls up their customers and orders the same way — scoped to your region.',
    placement: 'right',
  },
  var_sales_rep: {
    target: 'nav-var-reports',
    title: 'Your numbers',
    description: 'Your assigned customers, their orders, and how your book is performing all roll up here.',
    placement: 'right',
  },
}

/** Fallback for any role without its own step — keeps the tour total. */
const GENERIC_ROLE_STEP: TourStep = {
  target: 'sidebar-nav',
  title: 'Your workspace',
  description: 'The navigation adapts to your role — you\'ll only see the areas you have access to.',
  placement: 'right',
}

export function getTourSteps(role: string): TourStep[] {
  // Indexed defensively: an unrecognized role must degrade to a generic tour,
  // never render `undefined` into a step and crash the dashboard layout.
  const roleStep = ROLE_SPECIFIC_STEP[role as AppRole] ?? GENERIC_ROLE_STEP
  return [COMMON_INTRO, roleStep, ...COMMON_OUTRO]
}

export const WELCOME_COPY: Record<AppRole, { headline: string; body: string }> = {
  admin: {
    headline: 'Welcome to Byte-Back',
    body: 'You have full visibility — orders, pricing, users, and reporting across the whole platform. Let\'s take a 30-second tour of where everything lives.',
  },
  coe_manager: {
    headline: 'Welcome to Byte-Back',
    body: 'You oversee the inspection and fulfillment team. Let\'s take a quick tour of your queue and tools.',
  },
  coe_tech: {
    headline: 'Welcome to Byte-Back',
    body: 'You\'ll be inspecting and grading devices day to day. Let\'s take a quick tour of where things are.',
  },
  sales: {
    headline: 'Welcome to Byte-Back',
    body: 'You create orders, set pricing, and manage customer relationships. Let\'s take a quick tour of your tools.',
  },
  customer: {
    headline: 'Welcome to Byte-Back',
    body: 'Submit trade-ins, track quotes, and manage shipments — all from your own portal. Let\'s take a 30-second tour.',
  },
  vendor: {
    headline: 'Welcome to Byte-Back',
    body: 'Bid on open orders and track fulfillment for the ones you win. Let\'s take a quick tour of your portal.',
  },
  // Headlines here are re-written per tenant by brandCopy(), so a VAR's own
  // people see their own company name rather than Byte-Back's.
  var_entity_admin: {
    headline: 'Welcome to Byte-Back',
    body: 'You manage your organization end to end — your customers, your team and their regions, and reporting across all of it. Let\'s take a 30-second tour.',
  },
  var_regional_manager: {
    headline: 'Welcome to Byte-Back',
    body: 'You manage the customers and sales reps in your region. Let\'s take a quick tour of where everything lives.',
  },
  var_sales_rep: {
    headline: 'Welcome to Byte-Back',
    body: 'Your assigned customers, their orders, and how your book is performing all live here. Let\'s take a quick tour.',
  },
}

/** Welcome copy for any role, including one this build doesn't know about. */
const GENERIC_WELCOME = {
  headline: 'Welcome to Byte-Back',
  body: 'Let\'s take a quick tour of where everything lives.',
}

/**
 * Total lookup — never returns undefined. The previous direct index threw for
 * any role outside the 6 core ones, which took the whole dashboard down.
 */
export function getWelcomeCopy(role: string): { headline: string; body: string } {
  return WELCOME_COPY[role as AppRole] ?? GENERIC_WELCOME
}
