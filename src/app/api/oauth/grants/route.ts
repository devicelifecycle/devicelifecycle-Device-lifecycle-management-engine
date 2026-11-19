// ============================================================================
// /api/oauth/grants — the signed-in user's connected assistants
// ============================================================================
// GET lists active grants (one per client, newest token's last use);
// DELETE ?id=<family id> disconnects one. A user only ever sees and revokes
// their own grants.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized, refuseWhileImpersonating } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { revokeFamily } from '@/lib/oauth/oauth'
import { isValidUUID } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('oauth_tokens')
    .select('family_id, kind, scopes, created_at, last_used_at, expires_at, client:oauth_clients(client_name)')
    .eq('user_id', auth.profile.id).is('revoked_at', null).eq('kind', 'refresh').is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: 'Failed to load connected assistants' }, { status: 500 })
  const families = (data ?? []).map((t) => t.family_id as string)
  const lastUse = new Map<string, string | null>()
  if (families.length) {
    const { data: acc } = await supabase.from('oauth_tokens').select('family_id, last_used_at')
      .in('family_id', families).eq('kind', 'access').not('last_used_at', 'is', null)
      .order('last_used_at', { ascending: false }).limit(500)
    for (const a of acc ?? []) if (!lastUse.has(a.family_id as string)) lastUse.set(a.family_id as string, a.last_used_at as string)
  }
  return NextResponse.json({
    data: (data ?? []).map((t) => {
      const client = t.client as { client_name?: string } | { client_name?: string }[] | null
      return {
        id: t.family_id,
        client_name: (Array.isArray(client) ? client[0]?.client_name : client?.client_name) ?? 'AI assistant',
        scopes: t.scopes,
        connected_at: t.created_at,
        last_used_at: lastUse.get(t.family_id as string) ?? null,
      }
    }),
  })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const blocked = refuseWhileImpersonating(auth)
  if (blocked) return blocked
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  await revokeFamily(createServiceRoleClient(), id, auth.profile.id)
  return NextResponse.json({ ok: true })
}
