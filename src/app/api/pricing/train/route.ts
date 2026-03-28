// ============================================================================
// MANUAL PRICING TRAINING
// ============================================================================
// POST: Trigger pricing model training (admin/coe_manager only)
// Trains from order_items, imei_records, sales_history

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingTrainingService } from '@/services/pricing-training.service'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function POST() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile && !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden. Admin or COE manager required.' }, { status: 403 })
    }

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
