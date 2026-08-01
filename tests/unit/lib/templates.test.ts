import { describe, it, expect } from 'vitest'
import { resolveWhiteLabel, renderTemplate, DEFAULT_WHITELABEL } from '@/lib/templates'

describe('white-label content resolver', () => {
  it('empty resolves to defaults', () => {
    expect(resolveWhiteLabel(null)).toEqual(DEFAULT_WHITELABEL)
    expect(resolveWhiteLabel({})).toEqual(DEFAULT_WHITELABEL)
  })

  it('overrides only provided fields', () => {
    const w = resolveWhiteLabel({ quoteSubject: 'Quote from Acme' })
    expect(w.quoteSubject).toBe('Quote from Acme')
    expect(w.quoteIntro).toBe(DEFAULT_WHITELABEL.quoteIntro)
  })

  it('accepts only http(s) links', () => {
    expect(resolveWhiteLabel({ knowledgeBaseUrl: 'https://kb.acme.com' }).knowledgeBaseUrl).toBe('https://kb.acme.com')
    expect(resolveWhiteLabel({ knowledgeBaseUrl: 'javascript:alert(1)' }).knowledgeBaseUrl).toBeNull()
    expect(resolveWhiteLabel({ privacyPolicyUrl: 'ftp://x' }).privacyPolicyUrl).toBeNull()
  })
})

describe('renderTemplate', () => {
  it('interpolates known tokens and blanks unknown ones', () => {
    expect(renderTemplate('Hi {{customer}}, from {{company}}', { customer: 'Sam', company: 'Acme' }))
      .toBe('Hi Sam, from Acme')
    expect(renderTemplate('X {{missing}} Y', {})).toBe('X  Y')
  })

  it('tolerates whitespace in tokens and numeric values', () => {
    expect(renderTemplate('Total: {{ amount }}', { amount: 42 })).toBe('Total: 42')
  })

  it('does not recursively expand injected placeholders', () => {
    // A value containing {{company}} must NOT be re-substituted.
    expect(renderTemplate('{{x}}', { x: '{{company}}', company: 'SECRET' })).toBe('{{company}}')
  })
})
