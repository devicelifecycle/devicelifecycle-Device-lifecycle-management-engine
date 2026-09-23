import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './fixtures/auth'

/**
 * Every page that was un-gated on 2026-09-18, plus the pages added since.
 *
 * These rendered `<ComingSoon />` for months, so their real implementations
 * had never been executed in a browser — a runtime error inside one (a null
 * deref while loading, a bad hook order, a crash mapping over an empty list)
 * is invisible to `tsc` and to `next build`, which only compile them. This
 * mounts each one as a signed-in admin and fails on a page error, an error
 * boundary, or a page that renders nothing.
 *
 * One test per page so a slow page can't consume another's budget, and a
 * failure names the page directly.
 */

const PAGES = [
  '/admin/billing',
  '/admin/commission',
  '/admin/plans',
  '/admin/rve',
  '/admin/reports/commission',
  '/admin/reports/platform',
  '/admin/roles',
  '/admin/knowledge-base',
  '/admin/retention',
  '/admin/tenants',
  '/support/knowledge-base',
  '/var',
  '/var/api-keys',
  '/var/communications',
  '/var/features',
  '/var/customers',
  '/var/team',
  '/var/reports',
]

async function mountAndCollectErrors(page: Page, path: string): Promise<string[]> {
  const errors: string[] = []
  const onPageError = (e: Error) => errors.push(`pageerror: ${e.message}`)
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // Failed network calls are a data/permission concern, not a render crash;
    // this spec asks only whether the component executes.
    if (/Failed to load resource|net::ERR|status of 4\d\d|status of 5\d\d/i.test(t)) return
    // Vercel Analytics / Speed Insights scripts are injected by the platform
    // and only exist when deployed there; locally they 404 into the HTML
    // shell. Nothing to do with the page under test.
    if (/_vercel\/(insights|speed-insights)/.test(t)) return
    errors.push(`console: ${t.slice(0, 200)}`)
  }
  page.on('pageerror', onPageError)
  page.on('console', onConsole)

  try {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    // Give client fetches a moment to resolve loaders into real content,
    // without waiting for networkidle (polling pages never reach it).
    await page.waitForTimeout(2500)

    const boundary = page.locator('text=/Application error|Unhandled Runtime Error|Something went wrong/i')
    if (await boundary.count()) errors.push('error boundary rendered')

    const body = (await page.locator('body').innerText().catch(() => '')) || ''
    if (body.trim().length < 40) errors.push(`rendered almost nothing (${body.trim().length} chars)`)
    if (/Coming Soon/i.test(body)) errors.push('still shows Coming Soon')
  } finally {
    page.off('pageerror', onPageError)
    page.off('console', onConsole)
  }
  return errors
}

test.describe('Un-gated pages render without client errors', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await loginAs(page, 'admin')
  })
  test.afterAll(async () => { await page?.close() })

  for (const path of PAGES) {
    test(`renders ${path}`, async () => {
      test.setTimeout(60000)
      const errors = await mountAndCollectErrors(page, path)
      expect(errors, `${path}:\n${errors.join('\n')}`).toEqual([])
    })
  }
})
