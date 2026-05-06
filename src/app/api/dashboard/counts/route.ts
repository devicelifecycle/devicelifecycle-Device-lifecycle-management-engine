import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ counts: {} })

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ counts: {} })

    const service = createServiceRoleClient()
    const counts: Record<string, number> = {}

    if (['admin', 'coe_manager', 'sales'].includes(profile.role)) {
      const [{ count: pendingBids }, { count: actionableOrders }] = await Promise.all([
        service.from('vendor_bids').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        service.from('orders').select('*', { count: 'exact', head: true }).in('status', ['quoted', 'accepted']),
      ])
      counts.pendingBids = pendingBids ?? 0
      counts.actionableOrders = actionableOrders ?? 0
    }

    if (profile.role === 'vendor' && profile.organization_id) {
      const { data: vendor } = await service
        .from('vendors')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .maybeSingle()

      if (vendor) {
        const { count: pendingBids } = await service
          .from('vendor_bids')
          .select('*', { count: 'exact', head: true })
          .eq('vendor_id', vendor.id)
          .eq('status', 'pending')
        counts.pendingBids = pendingBids ?? 0
      }
    }

    return NextResponse.json({ counts })
  } catch {
    return NextResponse.json({ counts: {} })
  }
}
