import { expect, Page } from '@playwright/test'

const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'Test123!'

export const TEST_USERS = {
  admin: { email: process.env.E2E_ADMIN_EMAIL || 'admin@login.local', password: TEST_PASSWORD },
  coe_manager: { email: process.env.E2E_COE_MANAGER_EMAIL || 'coemgr@login.local', password: TEST_PASSWORD },
  coe_tech: { email: process.env.E2E_COE_TECH_EMAIL || 'coetech@login.local', password: TEST_PASSWORD },
  sales: { email: process.env.E2E_SALES_EMAIL || 'sales@login.local', password: TEST_PASSWORD },
  customer: { email: process.env.E2E_CUSTOMER_EMAIL || 'customer@login.local', password: TEST_PASSWORD },
  vendor: { email: process.env.E2E_VENDOR_EMAIL || 'vendor@login.local', password: TEST_PASSWORD },
  /** Org-linked customer (run npm run seed-org-customer) */
  customer_org: { email: process.env.E2E_CUSTOMER_ORG_EMAIL || 'customer-org@login.local', password: TEST_PASSWORD },
} as const

export type TestUserRole = keyof typeof TEST_USERS

function getPostLoginUrlMatcher(user: TestUserRole): RegExp {
  switch (user) {
    case 'customer':
    case 'customer_org':
      return /\/(dashboard|customer\/orders)/
    case 'vendor':
      return /\/(dashboard|vendor\/orders)/
    default:
      return /\/dashboard/
  }
}

/**
 * Log in as a test user. Navigates to login page, fills credentials, submits.
 * Requires: npm run seed-test-users and npm run seed-org-customer (for customer_org)
 */
export async function loginAs(page: Page, user: TestUserRole): Promise<void> {
  const { email, password } = TEST_USERS[user]
  const postLoginMatcher = getPostLoginUrlMatcher(user)
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  const emailInput = page.getByLabel(/login id or email/i)
  const passwordInput = page.getByLabel(/password/i).first()
  const submitButton = page.getByRole('button', { name: /sign in/i })
  await emailInput.waitFor({ state: 'visible', timeout: 5000 })
  await emailInput.fill(email)
  await expect(emailInput).toHaveValue(email)
  await passwordInput.fill(password)
  await expect(passwordInput).toHaveValue(password)
  await Promise.all([
    // In next dev, the first authenticated dashboard hit can spend time compiling.
    page.waitForURL(postLoginMatcher, { timeout: 60000, waitUntil: 'domcontentloaded' }),
    submitButton.click(),
  ])
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
}
