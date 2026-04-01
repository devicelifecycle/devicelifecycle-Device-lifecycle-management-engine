import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()
const createServiceRoleClientMock = vi.fn()
const transitionOrderMock = vi.fn()
const isValidTransitionMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

vi.mock('@/services/order.service', () => ({
  OrderService: {
    transitionOrder: transitionOrderMock,
    isValidTransition: isValidTransitionMock,
  },
}))

vi.mock('@/services/notification.service', () => ({
  NotificationService: {
    createNotification: vi.fn(),
    sendExceptionNotification: vi.fn(),
    sendExceptionResolvedNotification: vi.fn(),
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
    isValidTransitionMock.mockReturnValue(true)
    transitionOrderMock.mockResolvedValue(undefined)
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

  it('advances resolved triage orders into qc_complete once all devices are done', async () => {
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { status: 'received' },
                  error: null,
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    createServerSupabaseClientMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'imei_records') {
          return {
            select: vi.fn().mockImplementation((selection: string) => {
              if (selection.includes('order:orders')) {
                return {
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'imei-1',
                        order_id: 'order-1',
                        claimed_condition: 'good',
                        quoted_price: 400,
                        order: { id: 'order-1', status: 'received' },
                      },
                      error: null,
                    }),
                  }),
                }
              }

              if (selection === 'triage_status') {
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: [{ triage_status: 'complete' }],
                    error: null,
                  }),
                }
              }

              throw new Error(`Unexpected imei_records select: ${selection}`)
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }
        }

        if (table === 'triage_results') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'triage-1',
                    imei_record_id: 'imei-1',
                    final_condition: 'good',
                    exception_required: false,
                    price_adjustment: 0,
                  },
                  error: null,
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { TriageService } = await import('@/services/triage.service')
    const result = await TriageService.submitTriageResult({
      imei_record_id: 'imei-1',
      physical_condition: 'good',
      functional_grade: 'good',
      cosmetic_grade: 'good',
      screen_condition: 'good',
      battery_health: 95,
      storage_verified: true,
      original_accessories: false,
      functional_tests: {
        touchscreen: true,
        display: true,
        speakers: true,
        microphone: true,
        cameras: true,
        wifi: true,
        bluetooth: true,
        cellular: true,
        charging_port: true,
        buttons: true,
        face_id_or_touch_id: true,
        gps: true,
      },
      notes: 'All good',
      triaged_by_id: 'tech-1',
    })

    expect(result.outcome.exception_required).toBe(false)
    expect(transitionOrderMock).toHaveBeenNthCalledWith(1, 'order-1', 'in_triage', 'tech-1', 'Triage started')
    expect(transitionOrderMock).toHaveBeenNthCalledWith(2, 'order-1', 'qc_complete', 'tech-1', 'All devices triaged')
  })

  it('moves exception-approved orders to qc_complete when all devices are resolved', async () => {
    createServerSupabaseClientMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'imei_records') {
          return {
            select: vi.fn().mockImplementation((selection: string) => {
              if (selection === 'triage_status') {
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: [],
                    error: null,
                  }),
                }
              }

              throw new Error(`Unexpected imei_records select: ${selection}`)
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'triage_results') {
          return {
            select: vi.fn().mockImplementation((selection: string) => {
              if (selection.includes('imei_record:imei_records')) {
                return {
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'triage-2',
                        imei_record_id: 'imei-2',
                        price_adjustment: -120,
                        order: {
                          id: 'order-2',
                          order_number: 'ORD-2',
                          customer_id: 'customer-1',
                        },
                        imei_record: {
                          id: 'imei-2',
                          imei: '123456789012345',
                          quoted_price: 500,
                          device_id: null,
                        },
                      },
                      error: null,
                    }),
                  }),
                }
              }

              throw new Error(`Unexpected triage_results select: ${selection}`)
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'triage-2',
                      imei_record_id: 'imei-2',
                      final_condition: 'fair',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }

        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { status: 'in_triage' },
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'imei_records') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            select: vi.fn().mockImplementation((selection: string) => {
              if (selection === 'triage_status') {
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: [{ triage_status: 'complete' }],
                    error: null,
                  }),
                }
              }

              throw new Error(`Unexpected imei_records select: ${selection}`)
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { TriageService } = await import('@/services/triage.service')
    await TriageService.handleException('triage-2', true, 'customer-user', 'Approved')

    expect(transitionOrderMock).toHaveBeenCalledWith('order-2', 'qc_complete', 'customer-user', 'All devices triaged')
  })

  it('falls back to the order item unit price when the IMEI record is missing quoted_price', async () => {
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { status: 'received' },
                  error: null,
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    createServerSupabaseClientMock.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'imei_records') {
          return {
            select: vi.fn().mockImplementation((selection: string) => {
              if (selection.includes('order:orders')) {
                return {
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'imei-3',
                        order_id: 'order-3',
                        order_item_id: 'item-3',
                        claimed_condition: 'excellent',
                        quoted_price: null,
                        order: { id: 'order-3', status: 'received', customer_id: 'customer-3' },
                      },
                      error: null,
                    }),
                  }),
                }
              }

              if (selection === 'triage_status') {
                return {
                  eq: vi.fn().mockResolvedValue({
                    data: [{ triage_status: 'needs_exception' }],
                    error: null,
                  }),
                }
              }

              throw new Error(`Unexpected imei_records select: ${selection}`)
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }
        }

        if (table === 'triage_results') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'triage-3',
                    imei_record_id: 'imei-3',
                    final_condition: 'poor',
                    exception_required: true,
                    price_adjustment: -470,
                  },
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'order_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { quoted_price: null, unit_price: 850 },
                  error: null,
                }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    })

    const { TriageService } = await import('@/services/triage.service')
    const result = await TriageService.submitTriageResult({
      imei_record_id: 'imei-3',
      physical_condition: 'fair',
      functional_grade: 'fair',
      cosmetic_grade: 'fair',
      screen_condition: 'cracked',
      battery_health: 72,
      storage_verified: false,
      original_accessories: false,
      functional_tests: {
        touchscreen: false,
        display: false,
        speakers: false,
        microphone: false,
        cameras: true,
        wifi: true,
        bluetooth: true,
        cellular: false,
        charging_port: true,
        buttons: false,
        face_id_or_touch_id: true,
        gps: true,
      },
      notes: 'Damaged device',
      triaged_by_id: 'tech-3',
    })

    expect(result.outcome.exception_required).toBe(true)
    expect(result.outcome.price_adjustment).toBeLessThan(-50)
    expect(transitionOrderMock).toHaveBeenCalledWith('order-3', 'in_triage', 'tech-3', 'Triage started')
  })
})
