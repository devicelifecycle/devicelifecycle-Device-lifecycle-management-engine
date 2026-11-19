// RFC 8414 authorization-server metadata for the DLM MCP connector.
import { NextRequest, NextResponse } from 'next/server'
import { authorizationServerMetadata } from '@/lib/oauth/metadata'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return NextResponse.json(authorizationServerMetadata(req), {
    headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
  })
}
