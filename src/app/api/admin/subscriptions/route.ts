// ============================================================================
// ADMIN SUBSCRIPTIONS API — list + create subscriptions
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  listAllSubscriptions, createTrialSubscription, createPaidSubscription,
} from '@/lib/subscription-service'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  plan_slug: z.string().min(2),
  type: z.enum(['trial', 'paid']).default('trial'),
  trial_days: z.number().int().min(1).max(365).optional(),
  billing_interval: z.enum(['month', 'year']).optional(),
})

export async function GET(request: NextRequest) {
  const guard = await requirePermission('billing.view')
  if ('error' in guard) return guard.error

  const url = new URL(request.url)
  const status = url.searchParams.get('status') as 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | null
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))

  try {
    const supabase = createServiceRoleClient()
    const result = await listAllSubscriptions(supabase, {
      status: status ?? undefined,
      page,
      limit,
    })
    return NextResponse.json({ data: result.data, total: result.total, page, limit })
  } catch (err) {
    console.error('Failed to list subscriptions:', err)
    return NextResponse.json({ error: 'Failed to list subscriptions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission('billing.manage')
  if ('error' in guard) return guard.error

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  try {
    const supabase = createServiceRoleClient()
    const sub = parsed.data.type === 'trial'
      ? await createTrialSubscription(supabase, parsed.data.tenant_id, parsed.data.plan_slug, parsed.data.trial_days)
      : await createPaidSubscription(supabase, parsed.data.tenant_id, parsed.data.plan_slug, parsed.data.billing_interval)
    return NextResponse.json({ data: sub }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create subscription'
    const status = message.includes('already has') ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
