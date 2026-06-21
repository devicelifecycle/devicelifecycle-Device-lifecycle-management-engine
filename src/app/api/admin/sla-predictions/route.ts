// ============================================================================
// SLA EARLY-WARNING PREDICTIONS (heuristic, see sla-prediction.service.ts)
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { getEarlyWarnings } from '@/services/sla-prediction.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    if (!['admin', 'coe_manager'].includes(auth.profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await getEarlyWarnings()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error computing SLA early warnings:', error)
    return NextResponse.json({ error: 'Failed to compute SLA early warnings' }, { status: 500 })
  }
}
