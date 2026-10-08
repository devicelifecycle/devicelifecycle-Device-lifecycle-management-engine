// ============================================================================
// PUBLIC PRICING API — unauthenticated, returns active plans
// ============================================================================
// One source of truth: changes in admin/plans change what the public page shows.

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
    monthlyPrice: tier.monthlyPrice,
    currency: tier.currency,
    highlights: tier.highlights,
    inheritsFrom: tier.inheritsFrom ?? null,
    contactSales: tier.contactSales ?? false,
    roadmap: (tier.roadmap ?? []).map(r => r.label),
  }
}

export async function GET() {
  try {
    // Merge DB state (prices) with code-defined tier data (canonical)
    const supabase = createServiceRoleClient()
    const { data: dbPlans } = await supabase
      .from('subscription_plans')
      .select('slug, monthly_price, is_active')
      .eq('is_active', true)
      .order('monthly_price', { ascending: true, nullsFirst: true })

    const plans = PLAN_TIERS.map(tier => {
      const dbRow = dbPlans?.find(p => p.slug === tier.slug)
      const effectivePrice = dbRow?.monthly_price ?? tier.monthlyPrice
      return publicShape({
        ...tier,
        monthlyPrice: effectivePrice,
      })
    })

    return NextResponse.json({ data: plans })
  } catch {
    // Fallback: serve from code-defined tiers
    return NextResponse.json({ data: PLAN_TIERS.map(publicShape) })
  }
}
