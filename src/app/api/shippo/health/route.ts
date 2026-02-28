import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ShippoService } from '@/services/shippo.service'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const status = await ShippoService.healthCheck()
    return NextResponse.json(status, { status: status.keyValid ? 200 : 503 })
  } catch (error) {
    console.error('Shippo health check error:', error)
    return NextResponse.json({
      keyConfigured: Boolean(process.env.SHIPPO_API_KEY),
      apiReachable: false,
      keyValid: false,
      message: 'Shippo health endpoint failed',
    }, { status: 500 })
  }
}
