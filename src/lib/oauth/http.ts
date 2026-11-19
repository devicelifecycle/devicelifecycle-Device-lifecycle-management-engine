// Shared HTTP helpers for the OAuth endpoints (public PKCE clients → open CORS).
import { NextResponse } from 'next/server'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
}

export const oauthJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS })
export const oauthError = (error: string, error_description: string, status = 400) =>
  oauthJson({ error, error_description }, status)
export const preflight = () => new NextResponse(null, { status: 204, headers: CORS })

/** Token/revoke bodies arrive form-encoded (spec) or as JSON (some clients). */
export async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? ''
  const raw = await req.text()
  if (raw.length > 16_384) return {}
  if (type.includes('application/json')) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>
      return Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === 'string')) as Record<string, string>
    } catch { return {} }
  }
  return Object.fromEntries(new URLSearchParams(raw))
}
