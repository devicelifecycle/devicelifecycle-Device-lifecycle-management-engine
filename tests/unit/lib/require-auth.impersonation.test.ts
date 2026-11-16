import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cookies } from 'next/headers'
import { createMockSupabaseClient } from '../../helpers/mock-supabase'

const createServerSupabaseClientMock = vi.fn()
const createServiceRoleClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: createServerSupabaseClientMock }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: createServiceRoleClientMock }))

const ADMIN = { id: 'admin-1', role: 'admin', secondary_role: null, organization_id: null, tenant_id: 'platform', region: null, is_active: true, is_org_admin: false }
const VAR_ADMIN = { id: 'var-1', role: 'var_entity_admin', secondary_role: null, organization_id: null, tenant_id: 'tenant-sai', region: null, is_active: true, is_org_admin: false }
const SESSION = { id: 'imp-1', actor_id: 'admin-1', target_user_id: 'var-1' }

function setCookies(values: Record<string, string>) {
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn((name: string) => (name in values ? { name, value: values[name] } : undefined)),
  } as never)
}

// Service-role client: sees every tenant's rows.
function serviceRole(session = SESSION) {
  return {
    from: vi.fn((table: string) => {
      const q: any = {
        select: () => q, eq: () => q, is: () => q,
        maybeSingle: async () => ({ data: table === 'impersonation_log' ? session : null }),
        single: async () => ({ data: table === 'users' ? VAR_ADMIN : null }),
      }
      return q
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // The admin's own RLS-scoped client: can read its own profile, but tenant
  // isolation hides the VAR tenant's user row and the impersonation_log row.
  createServerSupabaseClientMock.mockResolvedValue(createMockSupabaseClient({ id: 'admin-1' }, ADMIN))
  createServiceRoleClientMock.mockImplementation(() => serviceRole())
})

describe('requireAuth impersonation', () => {
  it('swaps to a VAR user in another tenant', async () => {
    setCookies({ bb_impersonate_id: 'imp-1' })
    const { requireAuth } = await import('@/lib/supabase/require-auth')
    const auth = await requireAuth()
    expect(auth?.impersonating).toBe(true)
    expect(auth?.effectiveRole).toBe('var_entity_admin')
    expect(auth?.tenantId).toBe('tenant-sai')
    expect(auth?.actorId).toBe('admin-1')
  })

  it('ignores a session started by a different admin', async () => {
    createServiceRoleClientMock.mockImplementation(() => serviceRole({ ...SESSION, actor_id: 'someone-else' }))
    setCookies({ bb_impersonate_id: 'imp-1' })
    const { requireAuth } = await import('@/lib/supabase/require-auth')
    const auth = await requireAuth()
    expect(auth?.impersonating).toBeUndefined()
    expect(auth?.effectiveRole).toBe('admin')
  })

  it('never consults the service-role client for non-admins', async () => {
    createServerSupabaseClientMock.mockResolvedValue(createMockSupabaseClient({ id: 'var-1' }, VAR_ADMIN))
    setCookies({ bb_impersonate_id: 'imp-1' })
    const { requireAuth } = await import('@/lib/supabase/require-auth')
    const auth = await requireAuth()
    expect(auth?.impersonating).toBeUndefined()
    expect(createServiceRoleClientMock).not.toHaveBeenCalled()
  })
})
