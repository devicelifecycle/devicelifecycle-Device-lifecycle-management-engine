// ============================================================================
// ADMIN PLAN DETAIL API — edit / retire / delete one subscription plan
// ============================================================================
// A tenant is assigned a plan by SLUG (tenants.plan), not by id, so the slug
// is deliberately immutable here — renaming it would silently orphan every
// tenant already on the plan (their MRR would drop to 0 and their limits would
// fall back to defaults). Name, price, limits, features, and active state are
// all editable; retiring (is_active=false) keeps existing assignments working.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePlan } from '@/lib/plans'
import { isValidUUID } from '@/lib/utils'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  monthly_price: z.number().min(0).max(1_000_000).optional(),
  currency: z.enum(['CAD', 'USD']).optional(),
  limits: z.record(z.number().int().min(-1)).optional(),
  features: z.record(z.boolean()).optional(),
  is_active: z.boolean().optional(),
})

const PLAN_COLUMNS = 'id, name, slug, monthly_price, currency, limits, features, is_active, created_at'

async function adminOnly() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() as NextResponse }
  if (auth.effectiveRole !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { auth }
}

/** How many tenants are currently assigned this plan slug. */
async function tenantsOnPlan(
  supabase: ReturnType<typeof createServiceRoleClient>,
  slug: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from('tenants').select('id', { count: 'exact', head: true }).eq('plan', slug)
  if (error) return null // caller decides how to handle an unknown count
  return count ?? 0
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await adminOnly()
  if (g.error) return g.error
  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid plan id' }, { status: 400 })

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: existing, error: loadErr } = await supabase
    .from('subscription_plans').select('id, slug').eq('id', id).maybeSingle()
  if (loadErr) return NextResponse.json({ error: 'Failed to load plan' }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // No updated_at column on subscription_plans (see 20260805000000) — don't
  // invent one in the payload or the update fails outright.
  const { data, error } = await supabase
    .from('subscription_plans')
    .update(parsed.data)
    .eq('id', id)
    .select(PLAN_COLUMNS)
    .single()
  if (error) {
    console.error('Failed to update plan:', error)
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
  }

  // Surfaced so the UI can warn when a price change or retirement affects
  // tenants already on this plan.
  const inUse = await tenantsOnPlan(supabase, existing.slug as string)
  return NextResponse.json({ data: normalizePlan(data), tenantsOnPlan: inUse })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await adminOnly()
  if (g.error) return g.error
  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid plan id' }, { status: 400 })

  const supabase = createServiceRoleClient()
  const { data: existing, error: loadErr } = await supabase
    .from('subscription_plans').select('id, slug, name').eq('id', id).maybeSingle()
  if (loadErr) return NextResponse.json({ error: 'Failed to load plan' }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Deleting a plan that tenants are still on would orphan their assignment
  // (tenants.plan is a bare slug with no FK), so refuse and tell the admin to
  // move those tenants or retire the plan instead. Fails CLOSED: an unknown
  // count blocks the delete rather than risking an orphan.
  const inUse = await tenantsOnPlan(supabase, existing.slug as string)
  if (inUse === null) {
    return NextResponse.json({ error: 'Could not verify whether any VAR is on this plan' }, { status: 500 })
  }
  if (inUse > 0) {
    return NextResponse.json(
      {
        error: `${inUse} VAR${inUse === 1 ? ' is' : 's are'} still on "${existing.name}". Move them to another plan first, or retire this one instead of deleting it.`,
        tenantsOnPlan: inUse,
      },
      { status: 409 },
    )
  }

  const { error } = await supabase.from('subscription_plans').delete().eq('id', id)
  if (error) {
    console.error('Failed to delete plan:', error)
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
