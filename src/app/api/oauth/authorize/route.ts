// ============================================================================
// /api/oauth/authorize — backs the consent screen at /oauth/authorize
// ============================================================================
// GET  validates the request and describes it (who is asking, for what).
// POST records the signed-in user's decision and returns where to redirect.
// Nothing ever redirects until client_id AND redirect_uri are verified to
// match a registration (no open redirect).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getServedUrl as getAppUrl } from '@/lib/app-url'
import { issueCode, parseScopes, OAUTH_ROLES } from '@/lib/oauth/oauth'
import { mcpResourceUrl } from '@/lib/oauth/metadata'

export const dynamic = 'force-dynamic'

const reqSchema = z.object({
  client_id: z.string().min(1).max(100),
  redirect_uri: z.string().min(1).max(500),
  response_type: z.literal('code'),
  code_challenge: z.string().regex(/^[A-Za-z0-9\-_]{43}$/, 'code_challenge must be a S256 challenge'),
  code_challenge_method: z.literal('S256'),
  scope: z.string().max(200).optional(),
  state: z.string().max(500).optional(),
  resource: z.string().max(500).optional(),
})

type Validated =
  | { ok: true; p: z.infer<typeof reqSchema>; client: { id: string; client_name: string } }
  | { ok: false; status: number; error: string }

async function validate(raw: Record<string, unknown>, req: NextRequest): Promise<Validated> {
  const parsed = reqSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') }
  const p = parsed.data
  const { data: client } = await createServiceRoleClient().from('oauth_clients')
    .select('id, client_name, redirect_uris').eq('id', p.client_id).maybeSingle()
  if (!client) return { ok: false, status: 400, error: 'Unknown application (client_id).' }
  if (!(client.redirect_uris as string[]).includes(p.redirect_uri)) {
    return { ok: false, status: 400, error: 'redirect_uri is not registered for this application.' }
  }
  if (p.resource && p.resource.replace(/\/+$/, '') !== mcpResourceUrl(req)) {
    return { ok: false, status: 400, error: 'This sign-in is for a different resource.' }
  }
  return { ok: true, p, client: { id: client.id as string, client_name: client.client_name as string } }
}

async function signedInEligible() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized('Sign in to continue.') }
  if (auth.impersonating) return { error: NextResponse.json({ error: 'End impersonation before connecting an assistant.' }, { status: 403 }) }
  if (!(OAUTH_ROLES as readonly string[]).includes(auth.effectiveRole)) {
    return { error: NextResponse.json({ error: 'Assistant connections are available to your organization’s staff accounts (administrator, regional manager, sales rep).', code: 'role_not_eligible' }, { status: 403 }) }
  }
  return { auth }
}

export async function GET(req: NextRequest) {
  const v = await validate(Object.fromEntries(req.nextUrl.searchParams), req)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status })
  const g = await signedInEligible()
  if ('error' in g) return g.error
  const { data: me } = await createServiceRoleClient().from('users')
    .select('full_name, email, tenant:tenants(name)').eq('id', g.auth.profile.id).maybeSingle()
  const tenant = (me as { tenant?: { name?: string } | { name?: string }[] } | null)?.tenant
  return NextResponse.json({
    data: {
      client_name: v.client.client_name,
      redirect_host: new URL(v.p.redirect_uri).host,
      scopes: parseScopes(v.p.scope),
      user: {
        name: me?.full_name ?? null, email: me?.email ?? null, role: g.auth.effectiveRole,
        organization: (Array.isArray(tenant) ? tenant[0]?.name : tenant?.name) ?? null,
      },
    },
  })
}

export async function POST(req: NextRequest) {
  // Same-origin only: the consent screen is part of DLM.
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(getAppUrl(req)).origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 })
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  const { decision, ...rest } = body
  const v = await validate(rest, req)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status })
  const g = await signedInEligible()
  if ('error' in g) return g.error

  const target = new URL(v.p.redirect_uri)
  if (v.p.state) target.searchParams.set('state', v.p.state)
  target.searchParams.set('iss', getAppUrl(req)) // RFC 9207
  if (decision !== 'approve') {
    target.searchParams.set('error', 'access_denied')
    return NextResponse.json({ redirect: target.toString() })
  }
  const code = await issueCode(createServiceRoleClient(), {
    clientId: v.client.id, userId: g.auth.profile.id, redirectUri: v.p.redirect_uri,
    codeChallenge: v.p.code_challenge, scopes: parseScopes(v.p.scope), resource: v.p.resource ?? null,
  })
  target.searchParams.set('code', code)
  return NextResponse.json({ redirect: target.toString() })
}
