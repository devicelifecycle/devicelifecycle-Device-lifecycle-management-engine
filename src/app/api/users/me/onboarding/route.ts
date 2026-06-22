// ============================================================================
// MARK ONBOARDING COMPLETE/SKIPPED — self-service, any authenticated user
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser } = auth

    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', authUser.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error completing onboarding:', error)
    return NextResponse.json({ error: 'Failed to update onboarding status' }, { status: 500 })
  }
}
