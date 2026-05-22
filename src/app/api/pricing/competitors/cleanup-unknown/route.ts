// ============================================================================
// CLEANUP UNKNOWN STORAGE
// Permanently deletes competitor_prices where storage = 'UNKNOWN'
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
export const dynamic = 'force-dynamic'


export async function POST() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const { data: deleted, error } = await supabase
      .from('competitor_prices')
      .delete()
      .in('storage', ['UNKNOWN', 'unknown'])
      .select('id')

    if (error) {
      console.error('Cleanup UNKNOWN storage failed:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const count = deleted?.length ?? 0
    return NextResponse.json({ deleted: count, message: `Removed ${count} competitor prices with UNKNOWN storage` })
  } catch (error) {
    console.error('Cleanup UNKNOWN storage:', error)
    return NextResponse.json({ error: 'Failed to cleanup' }, { status: 500 })
  }
}
