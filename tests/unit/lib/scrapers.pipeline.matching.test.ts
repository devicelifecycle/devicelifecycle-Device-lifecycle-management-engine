import { describe, expect, it } from 'vitest'

import { isSafeCatalogModelMatch } from '@/lib/scrapers/pipeline'

describe('scraper catalog model matching', () => {
  it('rejects mapping higher-end variants onto shorter base models', () => {
    expect(isSafeCatalogModelMatch('iphone 14 pro max', 'iphone 14')).toBe(false)
    expect(isSafeCatalogModelMatch('iphone 15 plus', 'iphone 15')).toBe(false)
    expect(isSafeCatalogModelMatch('galaxy s24 ultra', 'galaxy s24')).toBe(false)
  })

  it('allows benign suffixes when the core model is still the same device', () => {
    expect(isSafeCatalogModelMatch('macbook air 13 2024', 'macbook air 13')).toBe(true)
    expect(isSafeCatalogModelMatch('iphone 14 5g', 'iphone 14')).toBe(true)
  })

  it('keeps exact matches valid', () => {
    expect(isSafeCatalogModelMatch('iphone 14', 'iphone 14')).toBe(true)
    expect(isSafeCatalogModelMatch('macbook pro 14', 'macbook pro 14')).toBe(true)
  })
})
