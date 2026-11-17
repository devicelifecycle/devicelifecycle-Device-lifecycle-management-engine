// ============================================================================
// MCP RESOURCES + PROMPTS — static reference material and ready-made asks
// ============================================================================
// Resources are reference data only (no tenant records), so they need no
// scope. Condition pricing multipliers are deliberately NOT exposed.

import { ORDER_STATUS_CONFIG, VALID_ORDER_TRANSITIONS, CONDITION_CONFIG } from '@/lib/constants'
import { TERMINAL_STATUSES } from './tools'

export interface McpResource {
  uri: string
  name: string
  title: string
  description: string
  mimeType: 'application/json'
  read(): unknown
}

export const RESOURCES: McpResource[] = [
  {
    uri: 'dlm://reference/order-statuses',
    name: 'order-statuses',
    title: 'Order statuses',
    description: 'Every order status, what it means, and which statuses it can move to next.',
    mimeType: 'application/json',
    read: () => Object.entries(ORDER_STATUS_CONFIG).map(([status, c]) => ({
      status,
      label: c.label,
      description: c.description,
      finished: TERMINAL_STATUSES.has(status),
      next: VALID_ORDER_TRANSITIONS[status as keyof typeof VALID_ORDER_TRANSITIONS] ?? [],
    })),
  },
  {
    uri: 'dlm://reference/device-conditions',
    name: 'device-conditions',
    title: 'Device conditions',
    description: 'The condition grades used for trade-in quotes and what each one means.',
    mimeType: 'application/json',
    read: () => Object.entries(CONDITION_CONFIG).map(([condition, c]) => ({
      condition, label: c.label, description: c.description,
    })),
  },
]

export interface McpPrompt {
  name: string
  title: string
  description: string
  arguments: { name: string; description: string; required: boolean }[]
  render(args: Record<string, string>): string
}

export const PROMPTS: McpPrompt[] = [
  {
    name: 'weekly_pipeline_summary',
    title: 'Weekly pipeline summary',
    description: 'Summarise the last 7 days of trade-in and CPO activity.',
    arguments: [],
    render: () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
      return [
        'Give me a weekly summary of our DLM order pipeline.',
        `1. Call order_pipeline_summary with created_since="${since}", and again without it for the overall picture.`,
        `2. Call list_orders with updated_since="${since}" to see what moved this week.`,
        'Report: new orders, orders finished, value in flight by status, anything SLA-breached, and the oldest open order. Keep it short, with a table for status counts.',
      ].join('\n')
    },
  },
  {
    name: 'needs_attention',
    title: 'What needs attention',
    description: 'Orders that are waiting on someone: quotes not yet accepted, SLA breaches, and stalled orders.',
    arguments: [
      { name: 'customer', description: 'Optional customer name to focus on.', required: false },
    ],
    render: (args) => [
      'What in DLM needs attention today?',
      args.customer ? `Focus on the customer "${args.customer}" (find it with list_customers first).` : '',
      '1. list_orders with status="quoted": quotes waiting for the customer, and when each quote expires.',
      '2. order_pipeline_summary: SLA-breached open orders and the oldest open order.',
      'List each item with its order number, customer, status, and how long it has waited. Most urgent first.',
    ].filter(Boolean).join('\n'),
  },
]
