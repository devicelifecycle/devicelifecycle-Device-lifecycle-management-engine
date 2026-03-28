// ============================================================================
// COMPETITOR PRICES API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'
import { createCompetitorPriceSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only internal roles can view competitor prices
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const deviceId = request.nextUrl.searchParams.get('device_id') || undefined
    const search = request.nextUrl.searchParams.get('search')?.trim() || undefined
    const conditionParam = request.nextUrl.searchParams.get('condition')
    const condition = conditionParam === 'excellent' || conditionParam === 'good' || conditionParam === 'fair' || conditionParam === 'broken'
      ? conditionParam
      : undefined

    const data = await PricingService.getCompetitorPrices(deviceId, condition, search)
    const rowsWithRetrievalTime = data.map((row) => ({
      ...row,
      retrieved_at: row.scraped_at || row.updated_at || row.created_at,
    }))

    return NextResponse.json({
      data: rowsWithRetrievalTime,
      total_count: rowsWithRetrievalTime.length,
      retrieved_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error fetching competitor prices:', error)
    return NextResponse.json({ error: 'Failed to fetch competitor prices' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    if (!['admin', 'coe_manager'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validation = createCompetitorPriceSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const entry = await PricingService.createCompetitorPrice(validation.data as any)

    // Notify admins about manual price entry
    const { NotificationService } = await import('@/services/notification.service')
    NotificationService.sendPriceUpdateNotification({
      source: 'manual',
      total_updated: 1,
      details: `${validation.data.competitor_name} — ${validation.data.condition}`,
    }).catch(err => console.error('Price notification error:', err))

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error creating competitor price:', error)
    return NextResponse.json({ error: 'Failed to create competitor price' }, { status: 500 })
  }
}
