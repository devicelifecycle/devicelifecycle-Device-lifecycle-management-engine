// ============================================================================
// CLEANUP UNKNOWN STORAGE
// Permanently deletes competitor_prices where storage = 'UNKNOWN'
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'


export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
