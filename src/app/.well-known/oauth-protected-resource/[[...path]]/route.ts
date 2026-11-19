// RFC 9728 protected-resource metadata for the DLM MCP server.
// Served at /.well-known/oauth-protected-resource and at the path-suffixed
// form /.well-known/oauth-protected-resource/api/mcp that MCP clients query.
import { NextRequest, NextResponse } from 'next/server'
import { protectedResourceMetadata } from '@/lib/oauth/metadata'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(req), {
    headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
  })
}
