// ============================================================================
// TICKETS API — list + create (tenant-scoped)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { parsePaging } from '@/lib/paging'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  subject: z.string().min(3).max(200),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  body: z.string().max(5000).optional(),
  customer_id: z.string().uuid().optional().nullable(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  const { page, limit, from, to } = parsePaging(request)
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('tickets')
    .select('id, tenant_id, subject, status, priority, created_by, created_at, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to)

  // Admins see every tenant; everyone else is scoped to their own tenant.
  if (auth.effectiveRole !== 'admin' && auth.tenantId) query = query.eq('tenant_id', auth.tenantId)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: 'Failed to load tickets' }, { status: 500 })
  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const supabase = createServiceRoleClient()

  const insert: Record<string, unknown> = {
    subject: parsed.data.subject,
    priority: parsed.data.priority,
    created_by: auth.profile.id,
    customer_id: parsed.data.customer_id ?? null,
  }
  // Bind the ticket to the caller's tenant (falls back to the column default).
  if (auth.tenantId) insert.tenant_id = auth.tenantId

  const { data: ticket, error } = await supabase
    .from('tickets').insert(insert).select('id, subject, status, priority, tenant_id, created_at').single()
  if (error) {
    console.error('Failed to create ticket:', error)
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
  }

  // Optional opening message.
  if (parsed.data.body?.trim()) {
    await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id, author_id: auth.profile.id, body: parsed.data.body.trim(),
    })
  }

  return NextResponse.json({ data: ticket }, { status: 201 })
}
