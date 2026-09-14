import { describe, it, expect } from 'vitest'
import { hslTripletToHex, DEFAULT_BRANDING } from '@/lib/branding'
import { brandLabelFromRow } from '@/lib/tenant-brand-label'

describe('hslTripletToHex', () => {
  // Exact HSL->RGB conversions, computed by hand rather than copied from the
  // Tailwind palette: the stored triplets are close to blue-600/blue-700 but
  // are NOT those hexes, and asserting the palette values instead of the real
  // conversion is how this test was wrong the first time.
  it('converts the platform brand blue (221 83% 53%)', () => {
    expect(hslTripletToHex('221 83% 53%').toLowerCase()).toBe('#2463eb')
  })

  it('converts the darkened secondary variant (221 83% 41%)', () => {
    expect(hslTripletToHex('221 83% 41%').toLowerCase()).toBe('#1249bf')
  })

  it('handles the achromatic ends without NaN', () => {
    expect(hslTripletToHex('0 0% 0%').toLowerCase()).toBe('#000000')
    expect(hslTripletToHex('0 0% 100%').toLowerCase()).toBe('#ffffff')
  })

  it('falls back instead of emitting a broken value for garbage input', () => {
    // Anything the email shell can not use must still be a valid 6-digit hex,
    // or the gradient string it is interpolated into breaks.
    for (const bad of ['', 'not a colour', '#2563eb', '221 83%']) {
      expect(hslTripletToHex(bad)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('every default brand colour converts to a usable hex', () => {
    expect(hslTripletToHex(DEFAULT_BRANDING.primary)).toMatch(/^#[0-9a-f]{6}$/i)
    expect(hslTripletToHex(DEFAULT_BRANDING.secondaryColor ?? '')).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('brandLabelFromRow colours', () => {
  it('carries a VAR tenant own colours through as hex for email', () => {
    const label = brandLabelFromRow('11111111-1111-4111-8111-111111111111', {
      name: 'Acme', primary: '0 100% 50%', secondaryColor: '120 100% 25%',
    })
    expect(label.primaryHex?.toLowerCase()).toBe('#ff0000')
    expect(label.secondaryHex?.toLowerCase()).toBe('#008000')
  })
})
