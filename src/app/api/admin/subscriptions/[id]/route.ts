// ============================================================================
// ADMIN SUBSCRIPTION DETAIL — view, transition, change plan, cancel
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  getSubscriptionById, transitionSubscription,
  cancelSubscription, reactivateSubscription, renewSubscription, changePlan,
} from '@/lib/subscription-service'
import { SUBSCRIPTION_STATUSES } from '@/lib/subscription'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const actionSchema = z.object({
  action: z.enum(['transition', 'cancel', 'reactivate', 'renew', 'change_plan']),
  to_status: z.enum(SUBSCRIPTION_STATUSES as unknown as [string, ...string[]]).optional(),
  plan_slug: z.string().min(2).optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission('billing.view')
  if ('error' in guard) return guard.error

  const { id } = await params
  try {
    const supabase = createServiceRoleClient()
    const sub = await getSubscriptionById(supabase, id)
    if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data: sub })
  } catch (err) {
    console.error('Failed to get subscription:', err)
    return NextResponse.json({ error: 'Failed to get subscription' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission('billing.manage')
  if ('error' in guard) return guard.error

  const { id } = await params
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()
    let result: unknown

    switch (parsed.data.action) {
      case 'transition':
        if (!parsed.data.to_status) return NextResponse.json({ error: 'to_status required' }, { status: 400 })
        result = await transitionSubscription(supabase, id, parsed.data.to_status as 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired')
        break
      case 'cancel':
        result = await cancelSubscription(supabase, id)
        break
      case 'reactivate':
        result = await reactivateSubscription(supabase, id)
        break
      case 'renew':
        result = await renewSubscription(supabase, id)
        break
      case 'change_plan':
        if (!parsed.data.plan_slug) return NextResponse.json({ error: 'plan_slug required' }, { status: 400 })
        result = await changePlan(supabase, id, parsed.data.plan_slug)
        break
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update subscription'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
