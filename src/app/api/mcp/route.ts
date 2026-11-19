// ============================================================================
// /api/mcp — DLM MCP server (Streamable HTTP, stateless, JSON responses)
// ============================================================================
// Auth: `Authorization: Bearer dlm_…` (a VAR API key from the API keys page),
// through the same authorizeV1 gate as /api/v1: valid key, per-key rate limit,
// the tenant's api_access feature. Quota is metered per tool call, not per
// protocol message. No SSE stream and no session: GET/DELETE answer 405.
// Kill switch: MCP_ENABLED=false.

import { NextRequest, NextResponse } from 'next/server'
import { authorizeV1, meterApiCall } from '@/lib/public-api'
import { handleMessage, RPC, type RpcResponse } from '@/lib/mcp/handler'
import type { McpContext } from '@/lib/mcp/registry'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { featureGate } from '@/lib/supabase/require-feature'
import { checkRateLimitAsync, RATE_LIMITS } from '@/lib/rate-limit'
import { ACCESS_PREFIX, OAUTH_ROLES, PLATFORM_OPERATOR_ROLES, verifyAccessToken } from '@/lib/oauth/oauth'
import { PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'
import { protectedResourceMetadataUrl } from '@/lib/oauth/metadata'

/**
 * Resolve an OAuth access token to a per-user MCP context. Re-checked on every
 * call: token live, user still active and still an eligible role in the same
 * tenant; VAR staff also need their VAR's api_access feature, and Byte-Back
 * operators must be on the platform tenant.
 */
async function oauthContext(req: NextRequest, token: string): Promise<{ ctx: McpContext } | { error: NextResponse }> {
  const svc = createServiceRoleClient()
  const p = await verifyAccessToken(svc, token)
  if (!p) return { error: rpcError(401, RPC.INVALID_REQUEST, 'Access token is invalid or expired. Sign in again.') }
  const { data: u } = await svc.from('users').select('id, role, region, tenant_id, is_active').eq('id', p.userId).maybeSingle()
  if (!u || u.is_active === false || !(OAUTH_ROLES as readonly string[]).includes(u.role as string) || u.tenant_id !== p.tenantId || !p.tenantId) {
    return { error: rpcError(401, RPC.INVALID_REQUEST, 'This connection is no longer valid for your account. Sign in again.') }
  }
  // Byte-Back operators must belong to the platform tenant; VAR staff are
  // gated on their VAR's API-access plan feature.
  const operator = (PLATFORM_OPERATOR_ROLES as readonly string[]).includes(u.role as string)
  if (operator && p.tenantId !== PLATFORM_TENANT_ID) {
    return { error: rpcError(401, RPC.INVALID_REQUEST, 'This connection is no longer valid for your account. Sign in again.') }
  }
  const rl = await checkRateLimitAsync(`mcp-oauth:${p.familyId}`, RATE_LIMITS.api)
  if (!rl.allowed) return { error: rpcError(429, RPC.INVALID_REQUEST, 'Rate limit exceeded. Try again shortly.') }
  if (!operator) {
    const gate = await featureGate(p.tenantId, 'api_access', 'API access')
    if (gate) return { error: gate }
  }
  const { data: client } = await svc.from('oauth_clients').select('client_name').eq('id', p.clientId).maybeSingle()
  return {
    ctx: {
      key: { keyId: `oauth:${p.familyId}`, tenantId: p.tenantId, scopes: p.scopes.map((s) => s.replace(/^dlm:/, '')) },
      tenantId: p.tenantId,
      supabase: svc,
      user: { id: u.id as string, role: u.role as string, region: (u.region as string | null) ?? null, clientName: (client?.client_name as string) ?? 'AI assistant' },
    },
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_BODY_BYTES = 256 * 1024
const MAX_BATCH = 20

function rpcError(status: number, code: number, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code, message } }, { status, headers })
}

/** Browsers send Origin; MCP clients don't. A foreign browser origin is refused (DNS-rebinding / CSRF guard). */
function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  if (origin === req.nextUrl.origin) return true
  const extra = (process.env.MCP_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return extra.includes(origin)
}

export async function POST(req: NextRequest) {
  if (process.env.MCP_ENABLED === 'false') {
    return rpcError(503, RPC.INTERNAL, 'The DLM MCP connector is disabled.')
  }
  if (!originAllowed(req)) return rpcError(403, RPC.INVALID_REQUEST, 'Origin not allowed.')

  // Authenticate before reading the body. Two credentials:
  //   dlmo_…  OAuth access token — a signed-in person (their scope, can act)
  //   dlm_…   organization API key — read-only, organization-wide
  const bearer = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const challenge = `Bearer realm="DLM", resource_metadata="${protectedResourceMetadataUrl(req)}"`
  if (!bearer) {
    return rpcError(401, RPC.INVALID_REQUEST, 'Sign in to DLM (OAuth) or send an API key: Authorization: Bearer dlm_...', { 'WWW-Authenticate': challenge })
  }
  let ctx: McpContext
  if (bearer.startsWith(ACCESS_PREFIX)) {
    const o = await oauthContext(req, bearer)
    if ('error' in o) {
      if (o.error.status === 401) o.error.headers.set('WWW-Authenticate', `${challenge}, error="invalid_token"`)
      return o.error
    }
    ctx = o.ctx
  } else {
    const auth = await authorizeV1(req, null, { meter: false })
    if ('error' in auth) {
      if (auth.error.status === 401) auth.error.headers.set('WWW-Authenticate', `${challenge}, error="invalid_token"`)
      return auth.error
    }
    ctx = auth.ctx
  }

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return rpcError(413, RPC.INVALID_REQUEST, 'Request too large.')
  let body: unknown
  try { body = JSON.parse(raw) } catch { return rpcError(400, RPC.PARSE, 'Parse error: body is not JSON.') }

  const deps = {
    meter: async (tenantId: string) => {
      const b = await meterApiCall(tenantId)
      return b ? { error: b.error, code: b.code } : null
    },
    log: (entry: Record<string, unknown>) => console.info(JSON.stringify(entry)),
  }

  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > MAX_BATCH) return rpcError(400, RPC.INVALID_REQUEST, `Batch must have 1-${MAX_BATCH} messages.`)
    const replies: RpcResponse[] = []
    for (const m of body) {
      const r = await handleMessage(m, ctx, deps)
      if (r) replies.push(r)
    }
    return replies.length ? NextResponse.json(replies) : new NextResponse(null, { status: 202 })
  }

  const reply = await handleMessage(body, ctx, deps)
  return reply ? NextResponse.json(reply) : new NextResponse(null, { status: 202 })
}

const notAllowed = () =>
  new NextResponse(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: RPC.METHOD_NOT_FOUND, message: 'This server is stateless: POST JSON-RPC messages to this URL. No SSE stream or session.' } }), {
    status: 405, headers: { Allow: 'POST', 'Content-Type': 'application/json' },
  })

export async function GET() { return notAllowed() }
export async function DELETE() { return notAllowed() }
