// ============================================================================
// ADMIN IMPERSONATION API — start / end a logged impersonation session
// ============================================================================
// Records the audit trail only (who impersonated whom, when, why). The actual
// session-swap + UI banner are layered on later; this guarantees every
// impersonation is logged first. Admin-only.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const startSchema = z.object({
  target_user_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
})
const endSchema = z.object({ id: z.string().uuid() })

async function adminOnly() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() as NextResponse }
  if (auth.effectiveRole !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { auth }
}

// GET — active + recent sessions (admin oversight).
export async function GET() {
  const g = await adminOnly()
  if (g.error) return g.error
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('impersonation_log')
    .select('id, actor_id, target_user_id, tenant_id, reason, started_at, ended_at')
    .order('started_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: 'Failed to load impersonation log' }, { status: 500 })
  return NextResponse.json({ data })
}

// POST — start a session (must not target yourself; one active session at a time).
export async function POST(request: NextRequest) {
  const g = await adminOnly()
  if (g.error) return g.error
  const parsed = startSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  if (parsed.data.target_user_id === g.auth.profile.id) {
    return NextResponse.json({ error: 'You cannot impersonate yourself' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: target } = await supabase.from('users').select('id, tenant_id').eq('id', parsed.data.target_user_id).maybeSingle()
  if (!target) return NextResponse.json({ error: 'Target user not found' }, { status: 404 })

  // Close any dangling active session for this admin before opening a new one.
  await supabase.from('impersonation_log').update({ ended_at: new Date().toISOString() })
    .eq('actor_id', g.auth.profile.id).is('ended_at', null)

  const { data, error } = await supabase.from('impersonation_log')
    .insert({ actor_id: g.auth.profile.id, target_user_id: target.id, tenant_id: target.tenant_id ?? null, reason: parsed.data.reason ?? null })
    .select('id, target_user_id, started_at').single()
  if (error) {
    console.error('Failed to start impersonation:', error)
    return NextResponse.json({ error: 'Failed to start impersonation' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}

// PATCH — end a session.
export async function PATCH(request: NextRequest) {
  const g = await adminOnly()
  if (g.error) return g.error
  const parsed = endSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })

  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('impersonation_log')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', parsed.data.id).eq('actor_id', g.auth.profile.id).is('ended_at', null)
  if (error) return NextResponse.json({ error: 'Failed to end impersonation' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
