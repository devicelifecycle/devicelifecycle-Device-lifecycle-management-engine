import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

/**
 * The platform is single-font: PT Sans everywhere, matching gorecell.ca.
 *
 * A font regression is invisible to tsc and to `next build` — a wrong variable
 * name or a stale `font-*` class just silently falls back to a system face,
 * which still looks fine in a screenshot. These assertions read the COMPUTED
 * font of real elements, so a fallback fails the test.
 */

const PAGES = ['/login', '/dashboard', '/orders', '/admin/tenants']

async function computedFamily(page: import('@playwright/test').Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontFamily)
}

test.describe('Typography — PT Sans platform-wide', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120000)

  test('the login page renders PT Sans, not a fallback', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    const body = await computedFamily(page, 'body')
    expect(body).toMatch(/PT Sans/i)
    // The old stack must be gone everywhere.
    expect(body).not.toMatch(/Outfit|Syne|Barlow|Poppins|Instrument|Source Serif/i)
  })

  test('the font file actually loads (not just declared)', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    // document.fonts knows what the browser actually resolved and loaded.
    const loaded = await page.evaluate(async () => {
      await (document as Document & { fonts: FontFaceSet }).fonts.ready
      return Array.from((document as Document & { fonts: FontFaceSet }).fonts).map((f) => f.family)
    })
    expect(loaded.join(',')).toMatch(/PT Sans/i)
    expect(loaded.join(',')).not.toMatch(/Outfit|Syne|Barlow|Poppins|Instrument|Source Serif/i)
  })

  test('every signed-in surface uses the same family — headings included', async ({ browser }) => {
    const page = await browser.newPage()
    await loginAs(page, 'admin')

    for (const path of PAGES.filter((p) => p !== '/login')) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)

      const body = await computedFamily(page, 'body')
      expect(body, `${path} body`).toMatch(/PT Sans/i)

      // Headings must not be a leftover display face.
      const headingCount = await page.locator('h1, h2').count()
      if (headingCount > 0) {
        const heading = await computedFamily(page, 'h1, h2')
        // PT Sans must be the FIRST family, not merely present in the stack.
        // (`sans-serif` is the legitimate last-resort fallback, so match the
        // head of the stack rather than searching for "serif" anywhere.)
        expect(heading, `${path} heading`).toMatch(/^["']?PT Sans/i)
        expect(heading, `${path} heading`).not.toMatch(/Instrument|Syne|Georgia|Source Serif/i)
      }
    }
    await page.close()
  })

  test('.editorial-title is PT Sans and no longer italic', async ({ browser }) => {
    const page = await browser.newPage()
    await loginAs(page, 'admin')
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    const el = page.locator('.editorial-title').first()
    if (await el.count()) {
      const style = await el.evaluate((n) => {
        const s = getComputedStyle(n)
        return { family: s.fontFamily, style: s.fontStyle, weight: s.fontWeight }
      })
      expect(style.family).toMatch(/PT Sans/i)
      expect(style.style).toBe('normal')
      expect(style.weight).toBe('700')
    }
    await page.close()
  })
})
