// ============================================================================
// REMINDERS API — schedule / list / mark sent (tenant-scoped)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { isValidDueDate } from '@/lib/reminders'
import { parsePaging } from '@/lib/paging'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  customer_id: z.string().uuid(),
  message: z.string().min(1).max(2000),
  due_at: z.string(),
})
const patchSchema = z.object({ id: z.string().uuid(), action: z.enum(['mark_sent', 'cancel']) })

function onlyTenantId(auth: { effectiveRole: string; tenantId: string | null }): string | null {
  return auth.effectiveRole !== 'admin' ? auth.tenantId : null
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const { page, limit, from, to } = parsePaging(request)
  const customerId = new URL(request.url).searchParams.get('customer_id')
  const scoped = onlyTenantId(auth)

  const supabase = createServiceRoleClient()
  let query = supabase.from('customer_reminders')
    .select('id, customer_id, message, due_at, sent_at, created_at', { count: 'exact' })
    .order('due_at', { ascending: true }).range(from, to)
  if (customerId) query = query.eq('customer_id', customerId)
  if (scoped) query = query.eq('tenant_id', scoped)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: 'Failed to load reminders' }, { status: 500 })
  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  if (!isValidDueDate(parsed.data.due_at)) {
    return NextResponse.json({ error: 'Reminder time must be a valid future date' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const insert: Record<string, unknown> = {
    customer_id: parsed.data.customer_id, message: parsed.data.message,
    due_at: new Date(parsed.data.due_at).toISOString(), created_by: auth.profile.id,
  }
  if (auth.tenantId) insert.tenant_id = auth.tenantId

  const { data, error } = await supabase.from('customer_reminders').insert(insert)
    .select('id, due_at, message').single()
  if (error) {
    console.error('Failed to schedule reminder:', error)
    return NextResponse.json({ error: 'Failed to schedule reminder' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })

  const supabase = createServiceRoleClient()
  const scoped = onlyTenantId(auth)

  if (parsed.data.action === 'cancel') {
    let del = supabase.from('customer_reminders').delete().eq('id', parsed.data.id)
    if (scoped) del = del.eq('tenant_id', scoped)
    const { error } = await del
    if (error) return NextResponse.json({ error: 'Failed to cancel reminder' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  let up = supabase.from('customer_reminders').update({ sent_at: new Date().toISOString() }).eq('id', parsed.data.id).is('sent_at', null)
  if (scoped) up = up.eq('tenant_id', scoped)
  const { error } = await up
  if (error) return NextResponse.json({ error: 'Failed to update reminder' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
