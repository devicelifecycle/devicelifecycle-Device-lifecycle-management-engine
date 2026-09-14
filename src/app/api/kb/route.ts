// ============================================================================
// KNOWLEDGE BASE — list + create (tenant-scoped)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { featureGate } from '@/lib/supabase/require-feature'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveTenantWhiteLabel } from '@/lib/templates'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().max(20000).optional().default(''),
  category: z.string().max(80).optional().default('General'),
  slug: z.string().max(200).optional(),
  is_published: z.boolean().optional().default(false),
})

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180) || 'article'
}

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const gated = await featureGate(auth.tenantId, 'knowledge_base', 'Knowledge base')
  if (gated) return gated
  const admin = auth.effectiveRole === 'admin'
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('kb_articles')
    .select('id, tenant_id, title, slug, category, is_published, created_at, updated_at')
    .order('updated_at', { ascending: false })
  // Non-admins only see published articles from their own tenant.
  if (!admin) {
    query = query.eq('tenant_id', auth.tenantId as string).eq('is_published', true)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to load articles' }, { status: 500 })

  // A VAR can point its users at its own hosted knowledge base
  // (settings.whitelabel.knowledgeBaseUrl). The field was editable and stored
  // but surfaced nowhere, so the link never reached a single user. Returned
  // here because this is the endpoint that answers "where is this tenant's
  // knowledge base" — resolveTenantWhiteLabel only ever yields an http(s) URL
  // or null.
  const { knowledgeBaseUrl } = await resolveTenantWhiteLabel(auth.tenantId, supabase)
  return NextResponse.json({ data, knowledgeBaseUrl })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const gatedWrite = await featureGate(auth.tenantId, 'knowledge_base', 'Knowledge base')
  if (gatedWrite) return gatedWrite
  if (!['admin', 'var_entity_admin'].includes(auth.effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const tenantId = auth.tenantId
  if (!tenantId) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })

  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(parsed.data.title)
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('kb_articles')
    .insert({
      tenant_id: tenantId,
      title: parsed.data.title,
      body: parsed.data.body ?? '',
      category: parsed.data.category ?? 'General',
      slug,
      is_published: parsed.data.is_published ?? false,
      created_by: auth.profile.id,
    })
    .select('id, title, slug, is_published')
    .single()
  if (error) return NextResponse.json({ error: 'Failed to create article' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
