// ============================================================================
// VAR / ADMIN API KEYS — revoke a single key (soft delete)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!['admin', 'var_entity_admin'].includes(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createServiceRoleClient()
  let query = supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', (await params).id)
  if (auth.effectiveRole !== 'admin') query = query.eq('tenant_id', auth.tenantId as string)
  const { error } = await query
  if (error) return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
