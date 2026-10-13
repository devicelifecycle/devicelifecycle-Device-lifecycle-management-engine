// ============================================================================
// CUSTOMER API KEY — revoke
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'customer' || !auth.profile.is_org_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const supabase = createServiceRoleClient()

  const { data: key } = await supabase
    .from('api_keys')
    .select('id, user_id, tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (!key || key.tenant_id !== auth.tenantId || key.user_id !== auth.profile.id) {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
