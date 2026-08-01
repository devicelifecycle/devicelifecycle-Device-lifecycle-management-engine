// ============================================================================
// ADMIN PLANS API — list + create subscription plans
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePlan } from '@/lib/plans'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  monthly_price: z.number().min(0).max(1_000_000),
  currency: z.enum(['CAD', 'USD']).optional().default('CAD'),
  limits: z.record(z.number().int().min(-1)).optional(),
  features: z.record(z.boolean()).optional(),
})

async function adminOnly() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() as NextResponse }
  if (auth.effectiveRole !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { auth }
}

export async function GET() {
  const g = await adminOnly()
  if (g.error) return g.error
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('id, name, slug, monthly_price, currency, limits, features, is_active, created_at')
    .order('monthly_price', { ascending: true })
  if (error) return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  return NextResponse.json({ data: (data ?? []).map(normalizePlan) })
}

export async function POST(request: NextRequest) {
  const g = await adminOnly()
  if (g.error) return g.error
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      monthly_price: parsed.data.monthly_price,
      currency: parsed.data.currency,
      limits: parsed.data.limits ?? {},
      features: parsed.data.features ?? {},
    })
    .select('id, name, slug, monthly_price, currency, limits, features, is_active, created_at')
    .single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `Slug "${parsed.data.slug}" is already taken` }, { status: 409 })
    console.error('Failed to create plan:', error)
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
  }
  return NextResponse.json({ data: normalizePlan(data) }, { status: 201 })
}
