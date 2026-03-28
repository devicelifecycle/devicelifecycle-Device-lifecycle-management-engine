import { describe, expect, it } from 'vitest'
import {
  appleValidationDevices,
  commonValidationDevices,
  edgeStorageFixtures,
  expectedNoResultFixtures,
  univercellValidationDevices,
  variantAndTypoFixtures,
} from '@/lib/scrapers/validation-fixtures'

describe('scraper validation fixtures', () => {
  it('covers the required storage edges', () => {
    const storages = new Set(edgeStorageFixtures.map((device) => device.storage))
    expect(storages.has('64GB')).toBe(true)
    expect(storages.has('128GB')).toBe(true)
    expect(storages.has('256GB')).toBe(true)
    expect(storages.has('512GB')).toBe(true)
    expect(storages.has('1TB')).toBe(true)
  })

  it('covers all conditions across the fixture matrix', () => {
    const allDevices = [
      ...appleValidationDevices,
      ...commonValidationDevices,
      ...edgeStorageFixtures,
      ...univercellValidationDevices,
    ]
    const conditions = new Set(allDevices.map((device) => device.condition))
    expect(conditions.has('excellent')).toBe(true)
    expect(conditions.has('good')).toBe(true)
    expect(conditions.has('fair')).toBe(true)
    expect(conditions.has('broken')).toBe(true)
  })

  it('includes typo and expected-no-result fixtures', () => {
    expect(variantAndTypoFixtures.length).toBeGreaterThan(0)
    expect(expectedNoResultFixtures.length).toBeGreaterThan(0)
  })
})
