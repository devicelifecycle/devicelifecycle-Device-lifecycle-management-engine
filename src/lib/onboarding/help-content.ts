// ============================================================================
// ROLE-SPECIFIC FAQ CONTENT
// ============================================================================
// Written by hand against this platform's actual workflows (status machines,
// SLA timings, etc.) — not generic filler. Keep it that way: if a workflow
// changes, update the relevant answers here too.

import type { UserRole } from '@/types'

export interface FaqEntry {
  question: string
  answer: string
}

const FAQ_BY_ROLE: Record<UserRole, FaqEntry[]> = {
  customer: [
    {
      question: 'How do I submit a trade-in?',
      answer: 'Go to My Orders and click New Order (or use the quick action on your dashboard). List the devices you want to trade in — you don\'t need exact condition details yet, just enough for us to quote you.',
    },
    {
      question: 'How long until I get a quote?',
      answer: 'We aim to quote within 24 hours of submission. Once quoted, you have time to review before it expires — the order detail page shows exactly when a response is expected.',
    },
    {
      question: 'I accepted my quote — what happens next?',
      answer: 'You\'ll ship your devices to our inspection center. Once we receive and inspect them, payment is processed if everything matches what you described.',
    },
    {
      question: 'What if the inspection finds something different than I described?',
      answer: 'If a device\'s actual condition doesn\'t match what you claimed, we flag it as an exception and notify you before changing anything — you\'ll need to approve or reject the adjusted offer for that device.',
    },
    {
      question: 'Can I set up recurring trade-ins for my organization?',
      answer: 'Yes — if you\'re your organization\'s admin, go to Team and turn on Recurring Trade-In Reminders. We\'ll nudge you on whatever cadence you pick; you still submit each batch yourself when it arrives.',
    },
  ],
  vendor: [
    {
      question: 'How do I find orders to bid on?',
      answer: 'Vendor Orders shows open CPO orders available for bidding. Submit a bid with your price, quantity, and lead time — admin reviews all bids and accepts one.',
    },
    {
      question: 'How do I know if my bid was accepted?',
      answer: 'You\'ll get a notification either way. Check My Bids any time to see the status of everything you\'ve submitted.',
    },
    {
      question: 'How can I tell if I\'m bidding competitively?',
      answer: 'Check the Performance page — it compares your bid prices against the price that actually won each decided order, so you can see if you\'re consistently bidding above market.',
    },
    {
      question: 'When do I get paid for a fulfilled order?',
      answer: 'Payout status for your fulfilled orders is tracked on the Performance page once an order is marked delivered/closed.',
    },
  ],
  sales: [
    {
      question: 'How do I create a new order for a customer?',
      answer: 'Use New Trade-In or New CPO Quote from the dashboard. You can set pricing on draft/submitted orders before sending the quote.',
    },
    {
      question: 'Can I see which of my orders need attention?',
      answer: 'Orders shows your full pipeline. The dashboard\'s "needs attention" strip flags anything quoted or accepted that\'s waiting on a next step.',
    },
  ],
  coe_tech: [
    {
      question: 'Where do I find devices to inspect?',
      answer: 'Triage shows everything in your queue. Look up the IMEI to pull carrier-lock and battery health automatically before grading.',
    },
    {
      question: 'What if the device doesn\'t match what the customer claimed?',
      answer: 'Flag it as an exception with your grading notes. It routes to the customer for approval before anything is finalized — you don\'t need to resolve the discrepancy yourself.',
    },
  ],
  coe_manager: [
    {
      question: 'How do I see my team\'s backlog?',
      answer: 'Triage and Receiving show the live queue. Exceptions surfaces anything flagged that needs review or escalation.',
    },
    {
      question: 'How do I know if something is falling behind?',
      answer: 'The dashboard\'s SLA Alerts count and the "Pacing Behind Normal" section flag orders running slower than the fixed threshold or historical norm, respectively — check both, they catch different things.',
    },
  ],
  admin: [
    {
      question: 'How do I give an organization its own self-service team management?',
      answer: 'Edit any customer/vendor user and toggle Org Admin. That person can then invite/deactivate their own teammates and edit their company profile from their own Team page, without you provisioning every login.',
    },
    {
      question: 'How do I see which company a user belongs to?',
      answer: 'The Organization column on the Users page links every user to their org. The Organizations page shows customer/vendor badges per org — including both, for dual-role companies.',
    },
    {
      question: 'How does the platform predict SLA risk before a breach?',
      answer: 'The dashboard\'s "Pacing Behind Normal" section compares each open order\'s time-in-stage against historical norms for that status and order type — it\'s a separate, earlier signal than the fixed warning_hours/breach_hours thresholds in SLA Rules.',
    },
    {
      question: 'Can I make a user see the welcome tour again?',
      answer: 'Yes — on the Users page, use Reset Onboarding on their row. It clears their completion flag so the welcome screen and guided tour show again on their next login.',
    },
  ],
}

export function getFaqForRole(role: UserRole): FaqEntry[] {
  return FAQ_BY_ROLE[role] || []
}
