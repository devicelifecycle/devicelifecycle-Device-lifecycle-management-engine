import { expect, Page } from '@playwright/test'

export const TEST_USERS = {
  admin: { email: 'jamal.h@genovation.ai', password: 'Test123!' },
  coe_manager: { email: 'faisalahmed4629@gmail.com', password: 'Test123!' },
  coe_tech: { email: 'jamalhuss@gmail.com', password: 'Test123!' },
  sales: { email: 'sales', password: 'Test123!' },
  customer: { email: 'customer', password: 'Test123!' },
  vendor: { email: 'vendor', password: 'Test123!' },
  /** Org-linked customer (run npm run seed-acme) */
  acme: { email: 'acme', password: 'Test123!' },
} as const

export type TestUserRole = keyof typeof TEST_USERS

/**
 * Log in as a test user. Navigates to login page, fills credentials, submits.
 * Requires: npm run seed-test-users and npm run seed-acme (for acme)
 */
export async function loginAs(page: Page, user: TestUserRole): Promise<void> {
  const { email, password } = TEST_USERS[user]
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  const emailInput = page.getByLabel(/login id/i)
  const passwordInput = page.getByLabel(/password/i).first()
  const submitButton = page.getByRole('button', { name: /sign in/i })
  await emailInput.waitFor({ state: 'visible', timeout: 5000 })
  await emailInput.fill(email)
  await expect(emailInput).toHaveValue(email)
  await passwordInput.fill(password)
  await expect(passwordInput).toHaveValue(password)
  await Promise.all([
    // In next dev, the first authenticated dashboard hit can spend time compiling.
    page.waitForURL(/\/dashboard/, { timeout: 60000, waitUntil: 'domcontentloaded' }),
    submitButton.click(),
  ])
}
