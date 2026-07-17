// ============================================================================
// ONBOARDING TOUR CONTENT
// ============================================================================
// Step targets are existing layout elements tagged with data-tour="..." in
// Sidebar.tsx / Header.tsx / ChatAssistant.tsx — never page-specific content,
// so every step's target exists on every dashboard page regardless of where
// the user lands after login. Keeps the tour robust without needing to
// auto-navigate the user mid-tour.

import type { UserRole } from '@/types'

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

const ROLE_SPECIFIC_STEP: Record<UserRole, TourStep> = {
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
}

export function getTourSteps(role: UserRole): TourStep[] {
  return [COMMON_INTRO, ROLE_SPECIFIC_STEP[role], ...COMMON_OUTRO]
}

export const WELCOME_COPY: Record<UserRole, { headline: string; body: string }> = {
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
}
