import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3002'
const OUTPUT_DIR = path.join(process.cwd(), 'artifacts', 'design-screens')

const ADMIN = {
  email: 'jamal.h@genovation.ai',
  password: 'Test123!',
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 60000, waitUntil: 'domcontentloaded' }),
    page.getByRole('button', { name: /sign in/i }).click(),
  ])
}

async function capture(page, fileName, route) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 60000 })
  const targetPath = path.join(OUTPUT_DIR, fileName)
  await page.screenshot({ path: targetPath, fullPage: true })
  return targetPath
}

async function main() {
  await ensureDir(OUTPUT_DIR)
  const browser = await chromium.launch({ headless: true })

  try {
    const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    const publicPage = await publicContext.newPage()
    await capture(publicPage, '01-landing.png', '/')
    await capture(publicPage, '02-login.png', '/login')
    await publicContext.close()

    const authedContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    const authedPage = await authedContext.newPage()
    await login(authedPage)
    await capture(authedPage, '03-dashboard.png', '/dashboard')
    await capture(authedPage, '04-orders.png', '/orders')
    await capture(authedPage, '05-pricing.png', '/admin/pricing')
    await capture(authedPage, '06-customers.png', '/customers')
    await capture(authedPage, '07-vendors.png', '/vendors')
    await authedContext.close()
  } finally {
    await browser.close()
  }

  console.log(OUTPUT_DIR)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
