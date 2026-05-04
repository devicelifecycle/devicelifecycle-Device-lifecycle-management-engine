import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Profile = { role: string } | null

const createMiddlewareSupabaseClientMock = vi.fn()

vi.mock('@/lib/supabase/middleware', () => ({
  createMiddlewareSupabaseClient: createMiddlewareSupabaseClientMock,
}))

function createMockSupabase({
  user,
  profile,
}: {
  user: { id: string } | null
  profile: Profile
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== 'users') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: profile }),
      }
    }),
  }
}

describe('middleware order access rules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows customers to access order detail routes', async () => {
    createMiddlewareSupabaseClientMock.mockReturnValue({
      supabase: createMockSupabase({
        user: { id: 'customer-user-1' },
        profile: { role: 'customer' },
      }),
      response: NextResponse.next(),
    })

    const { proxy } = await import('@/proxy')
    const response = await proxy(
      new NextRequest('http://localhost:3000/orders/550e8400-e29b-41d4-a716-446655440000')
    )

    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('allows vendors to access nested order routes', async () => {
    createMiddlewareSupabaseClientMock.mockReturnValue({
      supabase: createMockSupabase({
        user: { id: 'vendor-user-1' },
        profile: { role: 'vendor' },
      }),
      response: NextResponse.next(),
    })

    const { proxy } = await import('@/proxy')
    const response = await proxy(
      new NextRequest('http://localhost:3000/orders/550e8400-e29b-41d4-a716-446655440000/pdf')
    )

    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('still redirects customers away from the internal orders queue', async () => {
    createMiddlewareSupabaseClientMock.mockReturnValue({
      supabase: createMockSupabase({
        user: { id: 'customer-user-2' },
        profile: { role: 'customer' },
      }),
      response: NextResponse.next(),
    })

    const { proxy } = await import('@/proxy')
    const response = await proxy(new NextRequest('http://localhost:3000/orders'))

    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
  })
})
