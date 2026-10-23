// ============================================================================
// PUBLIC PRICING API — unauthenticated, returns active plans
// ============================================================================

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PLAN_TIERS, tierBySlug, type PlanTier } from '@/lib/plan-tiers'
export const dynamic = 'force-dynamic'

function publicShape(tier: PlanTier) {
  return {
    slug: tier.slug,
    name: tier.name,
    tagline: tier.tagline,
    bestFor: tier.bestFor,
    pricePerSeat: tier.pricePerSeat,
    currency: tier.currency,
    highlights: tier.highlights,
    inheritsFrom: tier.inheritsFrom ?? null,
    contactSales: tier.contactSales ?? false,
    roadmap: (tier.roadmap ?? []).map(r => r.label),
  }
}

export async function GET() {
  try {
    const supabase = createServiceRoleClient()
    const { data: dbPlans } = await supabase
      .from('subscription_plans')
      .select('slug, monthly_price, price_per_seat, is_active')
      .eq('is_active', true)
      .order('price_per_seat', { ascending: true, nullsFirst: true })

    const plans = PLAN_TIERS.map(tier => {
      const dbRow = dbPlans?.find(p => p.slug === tier.slug)
      const effectivePrice = dbRow?.price_per_seat ?? dbRow?.monthly_price ?? tier.pricePerSeat
      return publicShape({
        ...tier,
        pricePerSeat: effectivePrice,
      })
    })

    return NextResponse.json({ data: plans })
  } catch {
    return NextResponse.json({ data: PLAN_TIERS.map(publicShape) })
  }
}
