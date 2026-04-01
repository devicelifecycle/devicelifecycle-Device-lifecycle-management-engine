import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()
const createServiceRoleClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

vi.mock('@/services/notification.service', () => ({
  NotificationService: {
    createNotification: vi.fn(),
  },
}))

function makeTriageSupabase(data: unknown[]) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== 'triage_results') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data, error: null }),
      }
    }),
  }
}

describe('TriageService order lookups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('uses the service-role client for per-order triage lookups', async () => {
    const rows = [{ id: 'triage-1', order_id: 'order-1', exception_required: false }]
    createServiceRoleClientMock.mockReturnValue(makeTriageSupabase(rows))

    const { TriageService } = await import('@/services/triage.service')
    const results = await TriageService.getTriageResultsForOrder('order-1')

    expect(createServiceRoleClientMock).toHaveBeenCalledTimes(1)
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled()
    expect(results).toEqual(rows)
  })

  it('filters pending exceptions from the service-role order results', async () => {
    createServiceRoleClientMock.mockReturnValue(
      makeTriageSupabase([
        { id: 'triage-1', exception_required: true, exception_approved_at: null },
        { id: 'triage-2', exception_required: true, exception_approved_at: '2026-04-01T00:00:00.000Z' },
        { id: 'triage-3', exception_required: false, exception_approved_at: null },
      ]),
    )

    const { TriageService } = await import('@/services/triage.service')
    const results = await TriageService.getPendingExceptionsForOrder('order-2')

    expect(results).toEqual([{ id: 'triage-1', exception_required: true, exception_approved_at: null }])
  })
})
