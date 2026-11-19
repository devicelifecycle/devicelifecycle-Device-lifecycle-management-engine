import { describe, it, expect, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import { memoryDb } from '../../helpers/memory-db'
import {
  verifyPkce, isAllowedRedirectUri, parseScopes, issueCode, exchangeCode, refreshTokens, verifyAccessToken, sha256,
} from '@/lib/oauth/oauth'
import { safeRedirectPath } from '@/lib/auth-routing'
import { canonical, issueConfirmToken, checkConfirmToken } from '@/lib/mcp/confirm'

const verifier = 'a'.repeat(43) + 'Bc-._~9'
const challenge = createHash('sha256').update(verifier).digest('base64url')
let db: ReturnType<typeof memoryDb>

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-secret'
  db = memoryDb({
    oauth_clients: [{ id: 'c1', client_name: 'Claude', redirect_uris: ['https://claude.ai/cb'] }],
    users: [
      { id: 'rep', role: 'var_sales_rep', tenant_id: 't1', is_active: true },
      { id: 'cust', role: 'customer', tenant_id: 't1', is_active: true },
    ],
    oauth_codes: [], oauth_tokens: [],
  })
})

const code = (userId = 'rep') => issueCode(db as never, { clientId: 'c1', userId, redirectUri: 'https://claude.ai/cb', codeChallenge: challenge, scopes: ['dlm:read', 'dlm:write'], resource: null })

describe('OAuth primitives', () => {
  it('PKCE S256 verifies the right verifier only', () => {
    expect(verifyPkce(verifier, challenge)).toBe(true)
    expect(verifyPkce(verifier + 'x', challenge)).toBe(false)
    expect(verifyPkce('short', challenge)).toBe(false)
  })
  it('redirect URIs: https or loopback http only, no fragments', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(isAllowedRedirectUri('http://localhost:6274/oauth/callback')).toBe(true)
    expect(isAllowedRedirectUri('http://127.0.0.1:33418/cb')).toBe(true)
    expect(isAllowedRedirectUri('http://evil.example/cb')).toBe(false)
    expect(isAllowedRedirectUri('https://x.example/cb#frag')).toBe(false)
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false)
  })
  it('scopes: read always, write only when asked', () => {
    expect(parseScopes('')).toEqual(['dlm:read'])
    expect(parseScopes('dlm:write admin:everything')).toEqual(['dlm:read', 'dlm:write'])
  })
})

describe('authorization code → tokens', () => {
  it('exchanges once with the right verifier, client and redirect', async () => {
    const c = await code()
    const t = await exchangeCode(db as never, { code: c, verifier, clientId: 'c1', redirectUri: 'https://claude.ai/cb' })
    expect(t).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'dlm:read dlm:write' })
    expect((t as { access_token: string }).access_token).toMatch(/^dlmo_/)
    // stored only as hashes
    expect(db.tables.oauth_tokens.every((r) => !String(r.token_hash).startsWith('dlm'))).toBe(true)
    const again = await exchangeCode(db as never, { code: c, verifier, clientId: 'c1', redirectUri: 'https://claude.ai/cb' })
    expect(again).toMatchObject({ error: 'invalid_grant' })
  })
  it('refuses wrong verifier, wrong client, wrong redirect, expired code', async () => {
    expect(await exchangeCode(db as never, { code: await code(), verifier: verifier.replace('a', 'b'), clientId: 'c1', redirectUri: 'https://claude.ai/cb' })).toMatchObject({ error: 'invalid_grant' })
    expect(await exchangeCode(db as never, { code: await code(), verifier, clientId: 'c2', redirectUri: 'https://claude.ai/cb' })).toMatchObject({ error: 'invalid_grant' })
    expect(await exchangeCode(db as never, { code: await code(), verifier, clientId: 'c1', redirectUri: 'https://claude.ai/other' })).toMatchObject({ error: 'invalid_grant' })
    const c = await code()
    db.tables.oauth_codes.find((r) => r.code_hash === sha256(c))!.expires_at = new Date(Date.now() - 1000).toISOString()
    expect(await exchangeCode(db as never, { code: c, verifier, clientId: 'c1', redirectUri: 'https://claude.ai/cb' })).toMatchObject({ error: 'invalid_grant' })
  })
  it('only VAR staff can hold a grant', async () => {
    expect(await exchangeCode(db as never, { code: await code('cust'), verifier, clientId: 'c1', redirectUri: 'https://claude.ai/cb' })).toMatchObject({ error: 'invalid_grant' })
  })
  it('access token resolves to the user; revoked/expired tokens do not', async () => {
    const t = await exchangeCode(db as never, { code: await code(), verifier, clientId: 'c1', redirectUri: 'https://claude.ai/cb' }) as { access_token: string }
    expect(await verifyAccessToken(db as never, t.access_token)).toMatchObject({ userId: 'rep', tenantId: 't1', scopes: ['dlm:read', 'dlm:write'] })
    expect(await verifyAccessToken(db as never, 'dlm_not-oauth')).toBeNull()
    db.tables.oauth_tokens.find((r) => r.kind === 'access')!.revoked_at = new Date().toISOString()
    expect(await verifyAccessToken(db as never, t.access_token)).toBeNull()
  })
})

describe('refresh rotation', () => {
  it('rotates, kills the old access token, and treats a replayed refresh token as theft', async () => {
    const t1 = await exchangeCode(db as never, { code: await code(), verifier, clientId: 'c1', redirectUri: 'https://claude.ai/cb' }) as { access_token: string; refresh_token: string }
    const t2 = await refreshTokens(db as never, { refreshToken: t1.refresh_token, clientId: 'c1' }) as { access_token: string; refresh_token: string }
    expect(t2.refresh_token).not.toBe(t1.refresh_token)
    expect(await verifyAccessToken(db as never, t1.access_token)).toBeNull()
    expect(await verifyAccessToken(db as never, t2.access_token)).not.toBeNull()
    // replay of the first refresh token → whole grant revoked
    expect(await refreshTokens(db as never, { refreshToken: t1.refresh_token, clientId: 'c1' })).toMatchObject({ error: 'invalid_grant' })
    expect(await verifyAccessToken(db as never, t2.access_token)).toBeNull()
    expect(await refreshTokens(db as never, { refreshToken: t2.refresh_token, clientId: 'c1' })).toMatchObject({ error: 'invalid_grant' })
  })
  it('a deactivated user cannot refresh', async () => {
    const t = await exchangeCode(db as never, { code: await code(), verifier, clientId: 'c1', redirectUri: 'https://claude.ai/cb' }) as { refresh_token: string }
    db.tables.users[0].is_active = false
    expect(await refreshTokens(db as never, { refreshToken: t.refresh_token, clientId: 'c1' })).toMatchObject({ error: 'invalid_grant' })
  })
})

describe('login redirect safety (open-redirect fix)', () => {
  it('keeps same-site paths, refuses other origins', () => {
    expect(safeRedirectPath('/oauth/authorize?client_id=c1&state=x')).toBe('/oauth/authorize?client_id=c1&state=x')
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '/\u0000x', null]) expect(safeRedirectPath(bad)).toBeNull()
  })
})

describe('write confirmations', () => {
  it('bound to tool, exact arguments, user and time', () => {
    const args = { order: 'PO-1', note: 'ok' }
    const tok = issueConfirmToken('submit_order', args, 'u1', 1000)
    expect(checkConfirmToken(tok, 'submit_order', { note: 'ok', order: 'PO-1' }, 'u1', 2000)).toEqual({ ok: true })
    expect(checkConfirmToken(tok, 'submit_order', { order: 'PO-2', note: 'ok' }, 'u1', 2000)).toMatchObject({ ok: false })
    expect(checkConfirmToken(tok, 'cancel_order', args, 'u1', 2000)).toMatchObject({ ok: false })
    expect(checkConfirmToken(tok, 'submit_order', args, 'u2', 2000)).toMatchObject({ ok: false })
    expect(checkConfirmToken(tok, 'submit_order', args, 'u1', 1000 + 11 * 60_000)).toMatchObject({ ok: false })
    expect(checkConfirmToken(tok.slice(0, -2) + 'xx', 'submit_order', args, 'u1', 2000)).toMatchObject({ ok: false })
  })
  it('canonical JSON ignores key order and undefined', () => {
    expect(canonical({ b: 1, a: [2, { d: undefined, c: 3 }] })).toBe(canonical({ a: [2, { c: 3 }], b: 1 }))
  })
})
