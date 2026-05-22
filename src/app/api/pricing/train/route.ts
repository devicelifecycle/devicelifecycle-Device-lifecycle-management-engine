// ============================================================================
// MANUAL PRICING TRAINING
// ============================================================================
// POST: Trigger pricing model training (admin/coe_manager only)
// Trains from order_items, imei_records, sales_history

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { PricingTrainingService } from '@/services/pricing-training.service'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function POST() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const result = await PricingTrainingService.train()

    return NextResponse.json({
      success: true,
      baselines_upserted: result.baselines_upserted,
      condition_multipliers_updated: result.condition_multipliers_updated,
      sample_counts: result.sample_counts,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Pricing train error:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Training failed') },
      { status: 500 }
    )
  }
}
