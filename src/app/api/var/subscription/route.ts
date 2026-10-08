// ============================================================================
// VAR SUBSCRIPTION API — view + manage own subscription
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  getSubscription, cancelSubscription, reactivateSubscription,
  changePlan, getAccessDecision,
} from '@/lib/subscription-service'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const VAR_ADMIN_ROLES = ['var_entity_admin', 'admin']

const actionSchema = z.object({
  action: z.enum(['cancel', 'reactivate', 'change_plan']),
  plan_slug: z.string().min(2).optional(),
})

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!auth.tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 })

  try {
    const supabase = createServiceRoleClient()
    const sub = await getSubscription(supabase, auth.tenantId)

    if (!sub) {
      return NextResponse.json({ data: null, message: 'No active subscription' })
    }

    const access = getAccessDecision(sub)
    return NextResponse.json({
      data: {
        ...sub,
        access,
      },
    })
  } catch (err) {
    console.error('Failed to get subscription:', err)
    return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!VAR_ADMIN_ROLES.includes(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Only administrators can manage the subscription' }, { status: 403 })
  }
  if (!auth.tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 })

  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()
    const sub = await getSubscription(supabase, auth.tenantId)
    if (!sub) {
      return NextResponse.json({ error: 'No active subscription to manage' }, { status: 404 })
    }

    switch (parsed.data.action) {
      case 'cancel': {
        const result = await cancelSubscription(supabase, sub.id)
        return NextResponse.json({ data: result })
      }
      case 'reactivate': {
        const result = await reactivateSubscription(supabase, sub.id)
        return NextResponse.json({ data: result })
      }
      case 'change_plan': {
        if (!parsed.data.plan_slug) {
          return NextResponse.json({ error: 'plan_slug required for plan change' }, { status: 400 })
        }
        const result = await changePlan(supabase, sub.id, parsed.data.plan_slug)
        return NextResponse.json({ data: result })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update subscription'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
