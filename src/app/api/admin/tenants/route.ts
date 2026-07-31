// ============================================================================
// ADMIN TENANTS (VARs) API — list + create VAR tenants
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { parsePaging } from '@/lib/paging'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, hyphens only').optional(),
  parent_tenant_id: z.string().uuid().nullable().optional(),
})

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { page, limit, from, to } = parsePaging(request)
  const typeFilter = new URL(request.url).searchParams.get('type') // 'platform' | 'var' | null

  const supabase = createServiceRoleClient()
  let query = supabase
    .from('tenants')
    .select('id, parent_tenant_id, name, slug, type, is_active, custom_domain, plan, created_at', { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(from, to)
  if (typeFilter === 'platform' || typeFilter === 'var') query = query.eq('type', typeFilter)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: 'Failed to load tenants' }, { status: 500 })
  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const slug = parsed.data.slug || slugify(parsed.data.name)
  const supabase = createServiceRoleClient()

  const { data: existing } = await supabase.from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (existing) return NextResponse.json({ error: `Slug "${slug}" is already taken` }, { status: 409 })

  const { data, error } = await supabase
    .from('tenants')
    .insert({ name: parsed.data.name, slug, type: 'var', parent_tenant_id: parsed.data.parent_tenant_id ?? null })
    .select('id, name, slug, type, is_active, created_at')
    .single()

  if (error) {
    console.error('Failed to create tenant:', error)
    return NextResponse.json({ error: 'Failed to create VAR' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}
