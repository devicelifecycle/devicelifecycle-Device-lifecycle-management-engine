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

  // Authenticate before reading the body.
  const auth = await authorizeV1(req, null, { meter: false })
  if ('error' in auth) {
    if (auth.error.status === 401) {
      auth.error.headers.set('WWW-Authenticate', 'Bearer realm="DLM", error="invalid_token", error_description="Use a DLM API key: Authorization: Bearer dlm_..."')
    }
    return auth.error
  }
  const { ctx } = auth

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
