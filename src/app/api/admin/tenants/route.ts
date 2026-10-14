// ============================================================================
// ADMIN TENANTS (VARs) API — list + create VAR tenants
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { UserProvisioningService } from '@/services/user-provisioning.service'
import { parsePaging } from '@/lib/paging'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, hyphens only').optional(),
  parent_tenant_id: z.string().uuid().nullable().optional(),
  admin_name: z.string().min(2).max(120).optional(),
  admin_email: z.string().min(1).max(200).optional(),
})

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

export async function GET(request: NextRequest) {
  const guard = await requirePermission('tenant.view')
  if ('error' in guard) return guard.error

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
  const guard = await requirePermission('tenant.manage')
  if ('error' in guard) return guard.error

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
    if (error.code === '23505') {
      return NextResponse.json({ error: `Slug "${slug}" is already taken` }, { status: 409 })
    }
    console.error('Failed to create tenant:', error)
    return NextResponse.json({ error: 'Failed to create VAR' }, { status: 500 })
  }

  let admin: { tempPassword?: string; emailSentTo?: string; emailSent?: boolean } | null = null
  if (parsed.data.admin_name && parsed.data.admin_email) {
    try {
      const result = await UserProvisioningService.provisionUser({
        fullName: parsed.data.admin_name,
        email: parsed.data.admin_email,
        role: 'var_entity_admin',
        tenantId: data.id,
      })
      admin = {
        tempPassword: result.tempPassword,
        emailSentTo: result.emailSentTo,
        emailSent: result.emailSent,
      }
    } catch (adminErr) {
      console.error('VAR created but admin provisioning failed:', adminErr)
      const msg = adminErr instanceof Error ? adminErr.message : 'Failed to create admin'
      return NextResponse.json({ data, adminError: msg }, { status: 201 })
    }
  }

  return NextResponse.json({ data, admin }, { status: 201 })
}
