import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const handleExceptionMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()

vi.mock('@/services/triage.service', () => ({
  TriageService: {
    handleException: handleExceptionMock,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

function makeSupabase({
  user,
  profile,
  triage,
}: {
  user: { id: string } | null
  profile: { role?: string; organization_id?: string } | null
  triage: { order?: { customer?: { organization_id?: string } } } | null
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: profile }),
        }
      }

      if (table === 'triage_results') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: triage }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('POST /api/triage/[id]/exception', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    handleExceptionMock.mockResolvedValue({ id: 'triage-1', exception_approved: true })
  })

  it('allows customer from the owning organization to approve an exception', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'customer-user' },
        profile: { role: 'customer', organization_id: 'org-1' },
        triage: {
          order: {
            customer: { organization_id: 'org-1' },
          },
        },
      }),
    )

    const { POST } = await import('@/app/api/triage/[id]/exception/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/triage/triage-1/exception', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved: true, notes: 'Approved by customer' }),
      }),
      { params: { id: 'triage-1' } },
    )

    expect(response.status).toBe(200)
    expect(handleExceptionMock).toHaveBeenCalledWith(
      'triage-1',
      true,
      'customer-user',
      'Approved by customer',
    )
  })

  it('forbids customers from another organization', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'customer-user' },
        profile: { role: 'customer', organization_id: 'org-1' },
        triage: {
          order: {
            customer: { organization_id: 'org-2' },
          },
        },
      }),
    )

    const { POST } = await import('@/app/api/triage/[id]/exception/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/triage/triage-2/exception', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved: false }),
      }),
      { params: { id: 'triage-2' } },
    )

    expect(response.status).toBe(403)
    expect(handleExceptionMock).not.toHaveBeenCalled()
  })

  it('requires approved to be a boolean', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeSupabase({
        user: { id: 'admin-user' },
        profile: { role: 'admin', organization_id: 'org-admin' },
        triage: {
          order: {
            customer: { organization_id: 'org-1' },
          },
        },
      }),
    )

    const { POST } = await import('@/app/api/triage/[id]/exception/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/triage/triage-3/exception', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved: 'yes' }),
      }),
      { params: { id: 'triage-3' } },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'approved field is required',
    })
  })
})
