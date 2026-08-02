import { describe, it, expect } from 'vitest'
import { canTransitionAsset, ASSET_STATUSES, ASSET_STATUS_LABEL } from '@/lib/assets'

describe('asset status machine', () => {
  it('registered can be assigned or retired', () => {
    expect(canTransitionAsset('registered', 'assigned')).toBe(true)
    expect(canTransitionAsset('registered', 'retired')).toBe(true)
  })
  it('assigned can go back to registered or retire', () => {
    expect(canTransitionAsset('assigned', 'registered')).toBe(true)
    expect(canTransitionAsset('assigned', 'retired')).toBe(true)
  })
  it('retired can be reactivated to registered but not assigned directly', () => {
    expect(canTransitionAsset('retired', 'registered')).toBe(true)
    expect(canTransitionAsset('retired', 'assigned')).toBe(false)
  })
  it('rejects no-op and unknown transitions', () => {
    expect(canTransitionAsset('registered', 'registered')).toBe(false)
  })
  it('has three statuses with labels', () => {
    expect(ASSET_STATUSES).toHaveLength(3)
    expect(ASSET_STATUS_LABEL.assigned).toBe('Assigned')
  })
})
