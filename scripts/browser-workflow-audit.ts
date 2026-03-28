#!/usr/bin/env npx tsx

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Page, type BrowserContext } from '@playwright/test'
import seedE2EUsers from '../tests/e2e/global-setup'
import { TEST_USERS, type TestUserRole } from '../tests/e2e/fixtures/auth'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100'
const OUTPUT_ROOT = path.join(process.cwd(), 'artifacts', 'browser-audit', new Date().toISOString().replace(/[:.]/g, '-'))

type Check = {
  label: string
  path: string
  expectedPathPrefix: string
}

const workflows: Record<TestUserRole, Check[]> = {
  admin: [
    { label: 'dashboard', path: '/dashboard', expectedPathPrefix: '/dashboard' },
    { label: 'orders', path: '/orders', expectedPathPrefix: '/orders' },
    { label: 'new-trade-in', path: '/orders/new/trade-in', expectedPathPrefix: '/orders/new/trade-in' },
    { label: 'new-cpo', path: '/orders/new/cpo', expectedPathPrefix: '/orders/new/cpo' },
    { label: 'admin-users', path: '/admin/users', expectedPathPrefix: '/admin/users' },
    { label: 'admin-pricing', path: '/admin/pricing', expectedPathPrefix: '/admin/pricing' },
  ],
  coe_manager: [
    { label: 'receiving', path: '/coe/receiving', expectedPathPrefix: '/coe/receiving' },
    { label: 'triage', path: '/coe/triage', expectedPathPrefix: '/coe/triage' },
    { label: 'shipping', path: '/coe/shipping', expectedPathPrefix: '/coe/shipping' },
  ],
  coe_tech: [
    { label: 'receiving', path: '/coe/receiving', expectedPathPrefix: '/coe/receiving' },
    { label: 'triage', path: '/coe/triage', expectedPathPrefix: '/coe/triage' },
  ],
  sales: [
    { label: 'orders', path: '/orders', expectedPathPrefix: '/orders' },
    { label: 'customers', path: '/customers', expectedPathPrefix: '/customers' },
  ],
  customer: [
    { label: 'customer-orders', path: '/customer/orders', expectedPathPrefix: '/customer/orders' },
    { label: 'customer-requests', path: '/customer/requests', expectedPathPrefix: '/customer/requests' },
  ],
  acme: [
    { label: 'customer-orders', path: '/customer/orders', expectedPathPrefix: '/customer/orders' },
    { label: 'customer-requests', path: '/customer/requests', expectedPathPrefix: '/customer/requests' },
  ],
  vendor: [
    { label: 'vendor-orders', path: '/vendor/orders', expectedPathPrefix: '/vendor/orders' },
  ],
}

async function ensureDir(dirPath: string) {
  await mkdir(dirPath, { recursive: true })
}

async function loginAs(page: Page, role: TestUserRole) {
  const credentials = TEST_USERS[role]
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
  const emailInput = page.getByLabel(/login id/i)
  const passwordInput = page.getByLabel(/password/i).first()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await emailInput.fill(credentials.email)
    if ((await emailInput.inputValue()) === credentials.email) break
    await page.waitForTimeout(250)
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await passwordInput.fill(credentials.password)
    if ((await passwordInput.inputValue()) === credentials.password) break
    await page.waitForTimeout(250)
  }
  await emailInput.blur()
  await passwordInput.blur()
  await page.getByRole('button', { name: /sign in/i }).click()

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname.startsWith('/dashboard')) {
      return
    }
    await page.waitForTimeout(500)
  }

  throw new Error(`Login did not reach /dashboard for ${role}. Final URL: ${page.url()}`)
}

async function logout(page: Page) {
  await page.getByTitle('Sign out').click()
  await page.waitForURL(/\/login/, { timeout: 30000, waitUntil: 'domcontentloaded' })
}

async function capturePage(context: BrowserContext, page: Page, role: TestUserRole, label: string) {
  const roleDir = path.join(OUTPUT_ROOT, role)
  await ensureDir(roleDir)
  const filePath = path.join(roleDir, `${label}.png`)
  await page.screenshot({ path: filePath, fullPage: true })
  return filePath
}

async function runCheck(page: Page, role: TestUserRole, check: Check) {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(`${BASE_URL}${check.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      lastError = null
      break
    } catch (error) {
      lastError = error
      await page.waitForTimeout(1000)
    }
  }
  if (lastError) {
    throw lastError
  }
  const actualPath = new URL(page.url()).pathname
  const passed = actualPath.startsWith(check.expectedPathPrefix)
  const screenshotPath = await capturePage(page.context(), page, role, check.label)
  return {
    label: check.label,
    expected: check.expectedPathPrefix,
    actual: actualPath,
    passed,
    screenshotPath,
  }
}

async function main() {
  await seedE2EUsers()
  await ensureDir(OUTPUT_ROOT)

  const browser = await chromium.launch({ headless: true })
  const summary: Array<{
    role: TestUserRole
    loginPassed: boolean
    loginScreenshot?: string
    checks: Array<{ label: string; expected: string; actual: string; passed: boolean; screenshotPath: string }>
  }> = []

  try {
    for (const role of Object.keys(workflows) as TestUserRole[]) {
      const context = await browser.newContext()
      const page = await context.newPage()
      const result = {
        role,
        loginPassed: false,
        loginScreenshot: undefined as string | undefined,
        checks: [] as Array<{ label: string; expected: string; actual: string; passed: boolean; screenshotPath: string }>,
      }

      try {
        await loginAs(page, role)
        result.loginPassed = new URL(page.url()).pathname.startsWith('/dashboard')
        result.loginScreenshot = await capturePage(context, page, role, 'login-landing')

        for (const check of workflows[role]) {
          const checkResult = await runCheck(page, role, check)
          result.checks.push(checkResult)
          console.log(`${role} :: ${check.label} :: ${checkResult.passed ? 'PASS' : 'FAIL'} :: ${checkResult.actual}`)
        }

        await logout(page)
        await capturePage(context, page, role, 'logout')
      } finally {
        summary.push(result)
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }

  console.log('\nBrowser workflow audit summary:')
  console.log(JSON.stringify({ baseUrl: BASE_URL, outputRoot: OUTPUT_ROOT, summary }, null, 2))
}

main().catch((error) => {
  console.error('Browser workflow audit failed:', error instanceof Error ? error.stack || error.message : error)
  process.exit(1)
})
