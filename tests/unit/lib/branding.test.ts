import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BRANDING,
  resolveBranding,
  brandingCssVars,
  isDefaultBranding,
  tenantBrandingStyle,
} from '@/lib/branding'

describe('white-label branding resolver', () => {
  it('empty / null / non-object resolves to Byte-Back defaults', () => {
    expect(resolveBranding(null)).toEqual(DEFAULT_BRANDING)
    expect(resolveBranding({})).toEqual(DEFAULT_BRANDING)
    expect(resolveBranding('nope')).toEqual(DEFAULT_BRANDING)
    expect(resolveBranding(42)).toEqual(DEFAULT_BRANDING)
  })

  it('overrides only the fields a VAR sets, keeping defaults elsewhere', () => {
    const b = resolveBranding({ name: 'Acme Wireless', primary: '10 90% 50%' })
    expect(b.name).toBe('Acme Wireless')
    expect(b.primary).toBe('10 90% 50%')
    expect(b.sidebarBg).toBe(DEFAULT_BRANDING.sidebarBg) // untouched
    expect(b.tagline).toBe(DEFAULT_BRANDING.tagline)
  })

  it('rejects malformed HSL and falls back to default color', () => {
    const b = resolveBranding({ primary: 'red', sidebarBg: '#123456' })
    expect(b.primary).toBe(DEFAULT_BRANDING.primary)
    expect(b.sidebarBg).toBe(DEFAULT_BRANDING.sidebarBg)
  })

  it('accepts valid HSL triplets', () => {
    const b = resolveBranding({ primary: '270 60% 45%' })
    expect(b.primary).toBe('270 60% 45%')
  })

  it('uppercases + truncates the logo monogram', () => {
    expect(resolveBranding({ logoText: 'acme' }).logoText).toBe('ACME')
    expect(resolveBranding({ logoText: 'toolongmark' }).logoText).toBe('TOOLON')
  })

  it('trims empty strings back to defaults / null', () => {
    const b = resolveBranding({ name: '   ', supportEmail: '' })
    expect(b.name).toBe(DEFAULT_BRANDING.name)
    expect(b.supportEmail).toBeNull()
  })

  it('brandingCssVars emits the three themeable tokens', () => {
    const vars = brandingCssVars(DEFAULT_BRANDING)
    expect(vars['--primary']).toBe(DEFAULT_BRANDING.primary)
    expect(vars['--sidebar-bg']).toBe(DEFAULT_BRANDING.sidebarBg)
    expect(vars['--primary-foreground']).toBe(DEFAULT_BRANDING.primaryForeground)
  })

  it('isDefaultBranding detects platform default vs customized', () => {
    expect(isDefaultBranding(DEFAULT_BRANDING)).toBe(true)
    expect(isDefaultBranding(resolveBranding({ primary: '10 90% 50%' }))).toBe(false)
    expect(isDefaultBranding(resolveBranding({ name: 'Acme' }))).toBe(false)
  })

  describe('tenantBrandingStyle', () => {
    it('returns null for the platform default (inject nothing)', () => {
      expect(tenantBrandingStyle(DEFAULT_BRANDING)).toBeNull()
      expect(tenantBrandingStyle(resolveBranding({}))).toBeNull()
    })

    it('emits a doubled-:root rule with the branded tokens for a VAR', () => {
      const css = tenantBrandingStyle(resolveBranding({ primary: '270 60% 45%', name: 'Acme' }))
      expect(css).toContain(':root:root{')
      expect(css).toContain('--primary:270 60% 45%')
      expect(css).toContain('--sidebar-bg:')
      expect(css).toContain('--primary-foreground:')
    })

    it('emits only HSL-safe characters (no injection surface)', () => {
      // Malicious color is rejected by resolveBranding, so the style stays clean.
      const css = tenantBrandingStyle(resolveBranding({ name: 'Acme', primary: '} body{display:none' }))
      expect(css).not.toContain('display:none')
      expect(css).toMatch(/^:root:root\{[\d\s%;:\-a-z]+\}$/)
    })
  })
})
