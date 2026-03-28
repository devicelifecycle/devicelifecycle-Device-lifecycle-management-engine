import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from '@playwright/test'
import { loginAs } from './fixtures/auth'

const OUTPUT_DIR = path.join(process.cwd(), 'artifacts', 'design-screens')

async function capture(page: import('@playwright/test').Page, fileName: string, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await page.screenshot({
    path: path.join(OUTPUT_DIR, fileName),
    fullPage: true,
  })
}

test.describe('Visual snapshots', () => {
  test.setTimeout(120000)

  test.beforeAll(async () => {
    await fs.mkdir(OUTPUT_DIR, { recursive: true })
  })

  test('capture redesigned public and dashboard pages', async ({ page }) => {
    await capture(page, '01-landing.png', '/')
    await capture(page, '02-login.png', '/login')

    await loginAs(page, 'admin')
    await capture(page, '03-dashboard.png', '/dashboard')
    await capture(page, '04-orders.png', '/orders')
    await capture(page, '05-pricing.png', '/admin/pricing')
    await capture(page, '06-customers.png', '/customers')
    await capture(page, '07-vendors.png', '/vendors')
  })
})
