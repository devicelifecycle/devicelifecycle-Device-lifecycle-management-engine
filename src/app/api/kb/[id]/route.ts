// ============================================================================
// KNOWLEDGE BASE - single article GET / PATCH / DELETE (tenant-scoped)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  body: z.string().max(20000).optional(),
  category: z.string().max(80).optional(),
  slug: z.string().max(200).optional(),
  is_published: z.boolean().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const { id } = await params
  const supabase = createServiceRoleClient()
  let query = supabase.from('kb_articles').select('*').eq('id', id)
  if (auth.effectiveRole !== 'admin') query = query.eq('tenant_id', auth.tenantId as string)
  const { data, error } = await query.maybeSingle()
  if (error) return NextResponse.json({ error: 'Failed to load article' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!['admin', 'var_entity_admin'].includes(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
  }
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('kb_articles')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', auth.tenantId as string)
  if (error) return NextResponse.json({ error: 'Failed to update article' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!['admin', 'var_entity_admin'].includes(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('kb_articles')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenantId as string)
  if (error) return NextResponse.json({ error: 'Failed to delete article' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
