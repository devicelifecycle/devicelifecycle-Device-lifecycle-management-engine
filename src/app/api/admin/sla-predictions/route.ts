// ============================================================================
// SLA EARLY-WARNING PREDICTIONS (heuristic, see sla-prediction.service.ts)
// ============================================================================

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { getEarlyWarnings } from '@/services/sla-prediction.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const guard = await requirePermission('reports.view')
    if ('error' in guard) return guard.error

    const result = await getEarlyWarnings()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error computing SLA early warnings:', error)
    return NextResponse.json({ error: 'Failed to compute SLA early warnings' }, { status: 500 })
  }
}
