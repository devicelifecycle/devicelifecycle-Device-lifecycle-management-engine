// ============================================================================
// MCP WRITE CONFIRMATIONS — preview first, act only on an explicit confirm
// ============================================================================
// Step 1: a write tool called without confirm_token only PREVIEWS and returns
// a token. Step 2: the same call with that token acts. The token is an HMAC
// over (tool, exact arguments, user, expiry), so it can't be reused for other
// arguments, another user or another tool, and dies after 10 minutes. It is
// also single-use (mcp_confirmations): a replayed or retried confirm returns
// the first result instead of acting twice.
//
// Why: text inside DLM data (a customer name, an order note) reaches the model
// as tool output. Requiring a preview the person sees, then a confirm, means
// injected text can't make the assistant change anything on its own.

import { createHash, createHmac, timingSafeEqual } from 'crypto'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'

type Svc = ReturnType<typeof createServiceRoleClient>
export const CONFIRM_TTL_MS = 10 * 60_000

function secret(): string {
  const s = process.env.MCP_CONFIRM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('mcp: no confirmation secret configured')
  return createHash('sha256').update(`mcp-confirm:${s}`).digest('hex')
}

/** Stable JSON (sorted keys) so the same arguments always sign the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url')

export function issueConfirmToken(tool: string, args: unknown, userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ t: tool, a: canonical(args), u: userId, e: now + CONFIRM_TTL_MS })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export type ConfirmCheck = { ok: true } | { ok: false; reason: string }

export function checkConfirmToken(token: string, tool: string, args: unknown, userId: string, now = Date.now()): ConfirmCheck {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return { ok: false, reason: 'Malformed confirm_token.' }
  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'confirm_token is not valid.' }
  let p: { t: string; a: string; u: string; e: number }
  try { p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { return { ok: false, reason: 'Malformed confirm_token.' } }
  if (p.e < now) return { ok: false, reason: 'confirm_token expired. Preview again.' }
  if (p.u !== userId || p.t !== tool) return { ok: false, reason: 'confirm_token belongs to another action.' }
  if (p.a !== canonical(args)) return { ok: false, reason: 'The arguments changed since the preview. Preview again.' }
  return { ok: true }
}

/**
 * Claim a confirm token for single use. Returns the earlier result if it was
 * already used (idempotent replay), or 'claimed' when this call should act.
 */
export async function claimConfirmation(supabase: Svc, token: string, userId: string, tool: string): Promise<'claimed' | { replay: unknown }> {
  const hash = createHash('sha256').update(token).digest('hex')
  const { error } = await supabase.from('mcp_confirmations').insert({ token_hash: hash, user_id: userId, tool })
  if (!error) return 'claimed'
  const { data } = await supabase.from('mcp_confirmations').select('result').eq('token_hash', hash).maybeSingle()
  return { replay: data?.result ?? { status: 'in_progress', message: 'This action is already being processed.' } }
}

export async function recordConfirmationResult(supabase: Svc, token: string, result: unknown) {
  const hash = createHash('sha256').update(token).digest('hex')
  await supabase.from('mcp_confirmations').update({ result }).eq('token_hash', hash)
}
