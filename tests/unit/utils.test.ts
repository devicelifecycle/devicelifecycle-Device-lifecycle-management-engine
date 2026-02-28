import {
  sanitizeSearchInput,
  sanitizeCsvCell,
  safeErrorMessage,
  percentage,
  clamp,
  snakeToTitle,
  isValidIMEI,
} from '@/lib/utils'

describe('utils security and formatting', () => {
  it('sanitizeSearchInput escapes wildcard and strips filter-breaking chars', () => {
    const result = sanitizeSearchInput('  %iphone_(pro),v2.1  ')
    expect(result).toBe('\\%iphone\\_prov21')
  })

  it('sanitizeCsvCell neutralizes formula injection', () => {
    expect(sanitizeCsvCell('=1+1')).toBe("'=1+1")
    expect(sanitizeCsvCell('+SUM(A1:A5)')).toBe("'+SUM(A1:A5)")
    expect(sanitizeCsvCell('normal-text')).toBe('normal-text')
  })

  it('safeErrorMessage returns generic message in production', () => {
    const originalEnv = process.env.NODE_ENV
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'

    const message = safeErrorMessage(new Error('internal-db-error'), 'fallback')
    expect(message).toBe('fallback')

    ;(process.env as Record<string, string | undefined>).NODE_ENV = originalEnv
  })
})

describe('utils helpers', () => {
  it('percentage handles zero total safely', () => {
    expect(percentage(10, 0)).toBe(0)
    expect(percentage(5, 20)).toBe(25)
  })

  it('clamp enforces bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })

  it('snakeToTitle formats enum-like values', () => {
    expect(snakeToTitle('ready_to_ship')).toBe('Ready To Ship')
  })

  it('isValidIMEI validates exact 15 digits', () => {
    expect(isValidIMEI('123456789012345')).toBe(true)
    expect(isValidIMEI('12345678901234')).toBe(false)
    expect(isValidIMEI('12345678901234A')).toBe(false)
  })
})
