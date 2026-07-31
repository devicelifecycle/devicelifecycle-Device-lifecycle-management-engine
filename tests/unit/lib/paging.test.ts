import { describe, it, expect } from 'vitest'
import { parsePaging, DEFAULT_LIMIT, MAX_LIMIT } from '@/lib/paging'

const req = (qs: string) => ({ url: `https://x.test/api/list${qs}` })

describe('parsePaging', () => {
  it('defaults to page 1 and the default limit', () => {
    const p = parsePaging(req(''))
    expect(p).toEqual({ page: 1, limit: DEFAULT_LIMIT, from: 0, to: DEFAULT_LIMIT - 1 })
  })

  it('computes range bounds from page + limit', () => {
    expect(parsePaging(req('?page=3&limit=20'))).toEqual({ page: 3, limit: 20, from: 40, to: 59 })
  })

  it('clamps limit to MAX_LIMIT', () => {
    expect(parsePaging(req('?limit=100000')).limit).toBe(MAX_LIMIT)
  })

  it('floors page at 1 and limit at 1', () => {
    expect(parsePaging(req('?page=0&limit=0')).page).toBe(1)
    expect(parsePaging(req('?page=-5&limit=-5')).limit).toBe(1)
  })

  it('ignores non-numeric junk and falls back', () => {
    const p = parsePaging(req('?page=abc&limit=xyz'))
    expect(p.page).toBe(1)
    expect(p.limit).toBe(DEFAULT_LIMIT)
  })
})
