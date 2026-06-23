// ============================================================================
// ORDER NPS (Net Promoter Score) ROUTE
// Customer submits a 0-10 score + optional comment once an order is closed.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const npsSubmitSchema = z.object({
  score: z.number().int().min(0).max(10),
  comment: z.string().max(1000).optional(),
})

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { effectiveRole, profile } = auth
    if (effectiveRole !== 'customer') {
      return NextResponse.json({ error: 'Forbidden — customer role required' }, { status: 403 })
    }

    const orderId = (await params).id
    const serviceRole = createServiceRoleClient()
    const { data: order } = await serviceRole
      .from('orders')
      .select('id, status, customer:customers(organization_id)')
      .eq('id', orderId)
      .single()

    if (!order || (order.customer as { organization_id?: string } | null)?.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const { data: existing } = await serviceRole
      .from('nps_responses')
      .select('score, comment, created_at')
      .eq('order_id', orderId)
      .maybeSingle()

    return NextResponse.json({
      eligible: order.status === 'closed',
      response: existing || null,
    })
  } catch (error) {
    console.error('Error fetching NPS status:', error)
    return NextResponse.json({ error: 'Failed to fetch NPS status' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { authUser, effectiveRole, profile } = auth
    if (effectiveRole !== 'customer') {
      return NextResponse.json({ error: 'Forbidden — customer role required' }, { status: 403 })
    }

    const orderId = (await params).id
    const body = await request.json()
    const validation = npsSubmitSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.errors[0]?.message || 'Validation failed' }, { status: 400 })
    }

    const serviceRole = createServiceRoleClient()
    const { data: order } = await serviceRole
      .from('orders')
      .select('id, status, customer_id, customer:customers(organization_id)')
      .eq('id', orderId)
      .single()

    if (!order || (order.customer as { organization_id?: string } | null)?.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (order.status !== 'closed') {
      return NextResponse.json({ error: 'Feedback can only be submitted on a closed order' }, { status: 400 })
    }

    const { data: response, error } = await serviceRole
      .from('nps_responses')
      .insert({
        order_id: orderId,
        customer_id: order.customer_id,
        submitted_by_id: authUser.id,
        score: validation.data.score,
        comment: validation.data.comment || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Feedback already submitted for this order' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error('Error submitting NPS response:', error)
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 })
  }
}
