// ============================================================================
// SUBSCRIPTION ACCESS GUARD — for Route Handlers
// ============================================================================
// Checks whether the tenant's subscription allows write operations.
// Read-only subscriptions (expired, past-due past grace, trial expired) get
// a 403 on write operations but are allowed reads. No subscription row at all
// means the tenant hasn't been put on a subscription yet — allowed (the
// subscription system is additive, not restrictive-by-default).

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSubscription, getAccessDecision } from '@/lib/subscription-service'

export interface SubscriptionAccess {
  hasSubscription: boolean
  allowed: boolean
  readOnly: boolean
  reason?: string
}

export async function checkSubscriptionAccess(
  tenantId: string | null | undefined,
): Promise<SubscriptionAccess> {
  if (!tenantId) return { hasSubscription: false, allowed: true, readOnly: false }

  try {
    const supabase = createServiceRoleClient()
    const sub = await getSubscription(supabase, tenantId)

    if (!sub) return { hasSubscription: false, allowed: true, readOnly: false }

    const decision = getAccessDecision(sub)
    return {
      hasSubscription: true,
      allowed: decision.allowed,
      readOnly: decision.readOnly,
      reason: decision.reason,
    }
  } catch {
    return { hasSubscription: false, allowed: true, readOnly: false }
  }
}

const REASON_MESSAGES: Record<string, string> = {
  trial_expired: 'Your trial has expired. Please subscribe to continue.',
  past_due_grace_elapsed: 'Your payment is overdue. Please update your payment method to restore full access.',
  expired: 'Your subscription has expired. Please renew to continue.',
  cancelled_period_ended: 'Your subscription has ended. Please resubscribe to continue.',
}

export async function subscriptionWriteGuard(
  tenantId: string | null | undefined,
): Promise<NextResponse | null> {
  const access = await checkSubscriptionAccess(tenantId)
  if (!access.readOnly) return null

  const message = access.reason
    ? REASON_MESSAGES[access.reason] ?? 'Your subscription does not allow this action.'
    : 'Your subscription does not allow this action.'

  return NextResponse.json(
    { error: message, code: 'subscription_read_only', reason: access.reason },
    { status: 403 },
  )
}
