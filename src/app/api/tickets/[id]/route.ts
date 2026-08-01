// ============================================================================
// TICKET DETAIL API — fetch thread, transition status, add message
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { canTransitionTicket, type TicketStatus } from '@/lib/tickets'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  message: z.string().min(1).max(5000).optional(),
})

// Load the ticket + enforce that a non-admin can only touch its own tenant's.
async function loadScoped(id: string, auth: { effectiveRole: string; tenantId: string | null }) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('tickets').select('*').eq('id', id).maybeSingle()
  if (error || !data) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (auth.effectiveRole !== 'admin' && auth.tenantId && data.tenant_id !== auth.tenantId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ticket: data, supabase }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const { id } = await params
  const s = await loadScoped(id, auth)
  if (s.error) return s.error

  const { data: messages } = await s.supabase
    .from('ticket_messages').select('id, author_id, body, created_at')
    .eq('ticket_id', id).order('created_at', { ascending: true })
  return NextResponse.json({ data: { ticket: s.ticket, messages: messages ?? [] } })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const { id } = await params

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  if (parsed.data.status === undefined && !parsed.data.message?.trim()) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const s = await loadScoped(id, auth)
  if (s.error) return s.error

  if (parsed.data.status !== undefined) {
    if (!canTransitionTicket(s.ticket.status as TicketStatus, parsed.data.status)) {
      return NextResponse.json({ error: `Cannot move a ticket from ${s.ticket.status} to ${parsed.data.status}` }, { status: 400 })
    }
    await s.supabase.from('tickets').update({ status: parsed.data.status, updated_at: new Date().toISOString() }).eq('id', id)
  }

  if (parsed.data.message?.trim()) {
    await s.supabase.from('ticket_messages').insert({ ticket_id: id, author_id: auth.profile.id, body: parsed.data.message.trim() })
    await s.supabase.from('tickets').update({ updated_at: new Date().toISOString() }).eq('id', id)
  }

  return NextResponse.json({ ok: true })
}
