import { describe, expect, it } from 'vitest'

import { matchDeviceFromCsv } from '@/lib/device-match'
import type { Device } from '@/types'

const devices: Device[] = [
  {
    id: 'dev-iphone-15',
    make: 'Apple',
    model: 'iPhone 15',
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dev-iphone-14',
    make: 'Apple',
    model: 'iPhone 14',
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
]

describe('matchDeviceFromCsv', () => {
  it('matches when model redundantly includes make prefix', () => {
    const match = matchDeviceFromCsv(devices, 'apple', 'apple iphone 15')
    expect(match?.id).toBe('dev-iphone-15')
  })

  it('matches noisy free-typed model input like "iphone 14 s"', () => {
    const match = matchDeviceFromCsv(devices, 'apple', 'iphone 14 s')
    expect(match?.id).toBe('dev-iphone-14')
  })

  it('still matches regular make + model input', () => {
    const match = matchDeviceFromCsv(devices, 'apple', 'iphone 14')
    expect(match?.id).toBe('dev-iphone-14')
  })

  it('matches short model input like "iphone 11" when present in catalog', () => {
    const withIphone11 = [
      ...devices,
      {
        id: 'dev-iphone-11',
        make: 'Apple',
        model: 'iPhone 11',
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]

    const match = matchDeviceFromCsv(withIphone11, 'apple', 'iphone 11')
    expect(match?.id).toBe('dev-iphone-11')
  })
})
