import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AuditService } from '@/services/audit.service'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      return NextResponse.json({ error: 'Only administrators and CoE managers can view mismatch audit trail' }, { status: 403 })
    }

    const logs = await AuditService.getEntityHistory('order', (await params).id)
    const mismatchLogs = logs.filter((log) => {
      if (log.action !== 'price_change') return false
      const metadata = (log.metadata || {}) as { event?: string }
      return metadata.event === 'bulk_reprice_mismatches' || metadata.event === 'manual_mismatch_notice' || metadata.event === 'admin_added_mismatch'
    })

    return NextResponse.json({
      success: true,
      order_id: (await params).id,
      count: mismatchLogs.length,
      data: mismatchLogs,
    })
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, 'Failed to fetch mismatch audit trail') }, { status: 500 })
  }
}
