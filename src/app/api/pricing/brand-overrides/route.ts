// ============================================================================
// BRAND PRICING OVERRIDES API
// ============================================================================
// GET  — list all brand overrides
// POST — create or update a brand override (upsert by make)
// DELETE — remove a brand override (by ?make=Apple)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return { error: 'Forbidden — admin only', status: 403 }
  return { userId: user.id }
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('brand_pricing_overrides')
      .select('id, make, margin_percent, enabled, notes, updated_at')
      .order('make')
    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('[brand-overrides GET]', error)
    return NextResponse.json({ error: 'Failed to fetch brand overrides' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const auth = await requireAdmin(supabase)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await request.json()
    const make = (body.make || '').trim()
    if (!make) return NextResponse.json({ error: 'make is required' }, { status: 400 })

    const margin = body.margin_percent != null ? Number(body.margin_percent) : null
    if (margin != null && (Number.isNaN(margin) || margin < 0 || margin > 100)) {
      return NextResponse.json({ error: 'margin_percent must be 0–100' }, { status: 400 })
    }

    const srClient = createServiceRoleClient()
    const payload: Record<string, unknown> = {
      make,
      updated_at: new Date().toISOString(),
    }
    if (margin !== undefined) payload.margin_percent = margin
    if (body.enabled !== undefined) payload.enabled = Boolean(body.enabled)
    if (body.notes !== undefined) payload.notes = body.notes || null

    const { data, error } = await srClient
      .from('brand_pricing_overrides')
      .upsert(payload, { onConflict: 'make' })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) {
    console.error('[brand-overrides POST]', error)
    return NextResponse.json({ error: 'Failed to save brand override' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const auth = await requireAdmin(supabase)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const make = request.nextUrl.searchParams.get('make')
    if (!make) return NextResponse.json({ error: 'make query param required' }, { status: 400 })

    const srClient = createServiceRoleClient()
    const { error } = await srClient.from('brand_pricing_overrides').delete().ilike('make', make)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[brand-overrides DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete brand override' }, { status: 500 })
  }
}
