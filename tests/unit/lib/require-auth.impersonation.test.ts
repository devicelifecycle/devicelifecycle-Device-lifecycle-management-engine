import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cookies } from 'next/headers'

// Real server.ts + require-auth.ts; only the network edges are faked.
const serviceRoleMock = vi.fn()
const tokenMock = vi.fn()
const TARGET_CLIENT = { marker: 'runs-as-target' }
const ANON_CLIENT = { marker: 'anon-sees-nothing' }

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => serviceRoleMock() }))
vi.mock('@/lib/supabase/impersonation-session', () => ({
  impersonationAccessToken: (...a: unknown[]) => tokenMock(...a),
  clientForToken: () => TARGET_CLIENT,
  dropImpersonationToken: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ANON_CLIENT }))

const ADMIN = { id: 'admin-1', role: 'admin', secondary_role: 'coe_manager', organization_id: null, tenant_id: 'platform', region: null, is_active: true, is_org_admin: false, tenants: { branding: {} } }
const VAR_USER = { id: 'var-1', role: 'var_entity_admin', secondary_role: null, organization_id: null, tenant_id: 'tenant-sai', region: null, is_active: true, is_org_admin: false }
let signedIn = ADMIN
const cookieClient = {
  marker: 'admin-cookie-session',
  auth: { getSession: async () => ({ data: { session: { user: { id: signedIn.id }, access_token: 'x' } } }) },
  from: () => { const q: Record<string, unknown> = {}; q.select = () => q; q.eq = () => q; q.single = async () => ({ data: signedIn }); return q },
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => cookieClient }))

function svc({ log = { id: 'imp-1', actor_id: 'admin-1', target_user_id: 'var-1' } as Record<string, unknown> | null, actor = ADMIN as Record<string, unknown>, target = VAR_USER as Record<string, unknown> } = {}) {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const q: Record<string, unknown> = {}
      q.select = () => q; q.is = () => q
      q.eq = (c: string, v: unknown) => { filters[c] = v; return q }
      q.maybeSingle = async () => {
        if (table === 'impersonation_log') return { data: log }
        if (table === 'users') return { data: filters.id === 'admin-1' ? actor : target }
        return { data: null }
      }
      return q
    },
  }
}
function setCookies(values: Record<string, string>) {
  vi.mocked(cookies).mockResolvedValue({ get: (n: string) => (n in values ? { name: n, value: values[n] } : undefined), getAll: () => [] } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  signedIn = ADMIN
  serviceRoleMock.mockImplementation(() => svc())
  tokenMock.mockResolvedValue('target-token')
})

describe('impersonation: identity AND data run as the target', () => {
  it('requireAuth swaps identity and hands back a client running as the target (no mixed data)', async () => {
    setCookies({ bb_impersonate_id: 'imp-1' })
    const { requireAuth } = await import('@/lib/supabase/require-auth')
    const auth = await requireAuth()
    expect(auth).toMatchObject({ impersonating: true, effectiveRole: 'var_entity_admin', tenantId: 'tenant-sai', actorId: 'admin-1' })
    expect(auth?.supabase).toBe(TARGET_CLIENT)
    expect(tokenMock).toHaveBeenCalledWith('imp-1', 'var-1')
    // routes scope by authUser.id ("my orders", created_by…)
    expect(auth?.authUser.id).toBe('var-1')
  })

  it('account-security and money actions are refused while impersonating', async () => {
    setCookies({ bb_impersonate_id: 'imp-1' })
    const { requireAuth, refuseWhileImpersonating } = await import('@/lib/supabase/require-auth')
    const auth = (await requireAuth())!
    expect(refuseWhileImpersonating(auth)?.status).toBe(403)
    setCookies({})
    expect(refuseWhileImpersonating((await requireAuth())!)).toBeNull()
  })

  it('services that build their own client also get the target client', async () => {
    setCookies({ bb_impersonate_id: 'imp-1' })
    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    expect(await createServerSupabaseClient()).toBe(TARGET_CLIENT)
    expect(await createServerSupabaseClient({ identity: true })).toBe(cookieClient)
  })

  it('a session started by another admin is ignored', async () => {
    serviceRoleMock.mockImplementation(() => svc({ log: { id: 'imp-1', actor_id: 'someone-else', target_user_id: 'var-1' } }))
    setCookies({ bb_impersonate_id: 'imp-1' })
    const { requireAuth } = await import('@/lib/supabase/require-auth')
    const auth = await requireAuth()
    expect(auth?.impersonating).toBeUndefined()
    expect(auth?.supabase).toBe(cookieClient)
    expect(tokenMock).not.toHaveBeenCalled()
  })

  it('an ended session, an admin target, or an inactive target never swaps', async () => {
    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    setCookies({ bb_impersonate_id: 'imp-1' })
    for (const s of [svc({ log: null }), svc({ target: { ...VAR_USER, role: 'admin' } }), svc({ target: { ...VAR_USER, is_active: false } })]) {
      serviceRoleMock.mockImplementation(() => s)
      expect(await createServerSupabaseClient()).toBe(cookieClient)
    }
    expect(tokenMock).not.toHaveBeenCalled()
  })

  it('an admin switched to their secondary role does not impersonate', async () => {
    setCookies({ bb_impersonate_id: 'imp-1', dlm_active_role: 'coe_manager' })
    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    expect(await createServerSupabaseClient()).toBe(cookieClient)
  })

  it("fails closed: if the target token can't be minted, data access is anonymous, never the admin's", async () => {
    tokenMock.mockRejectedValue(new Error('mint failed'))
    setCookies({ bb_impersonate_id: 'imp-1' })
    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    expect(await createServerSupabaseClient()).toBe(ANON_CLIENT)
  })

  it('no impersonation cookie: no extra lookups at all', async () => {
    setCookies({})
    const { requireAuth } = await import('@/lib/supabase/require-auth')
    const auth = await requireAuth()
    expect(auth?.effectiveRole).toBe('admin')
    expect(serviceRoleMock).not.toHaveBeenCalled()
  })

  it('a non-admin carrying an impersonation cookie is never swapped', async () => {
    signedIn = { ...VAR_USER, tenants: { branding: {} } } as unknown as typeof ADMIN
    setCookies({ bb_impersonate_id: 'imp-1' })
    const { requireAuth } = await import('@/lib/supabase/require-auth')
    const auth = await requireAuth()
    expect(auth?.impersonating).toBeUndefined()
    expect(auth?.effectiveRole).toBe('var_entity_admin')
  })
})
