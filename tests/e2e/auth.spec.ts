import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

test.describe('Authentication', () => {
  test('unauthenticated user redirected to login when visiting /dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/login id or email/i).fill('invalidlogin')
    await page.getByLabel(/^password$/i).fill('WrongPassword123!')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByText(/invalid|error/i)).toBeVisible()
  })

  test('logout clears session and redirects to home', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(/\/dashboard/)

    await page.getByTitle('Sign out').click()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 15000 })
    await page.waitForURL(/\/login/, { timeout: 15000, waitUntil: 'domcontentloaded' })

    // Verify session is cleared: visiting dashboard redirects to login
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login/)
  })
})
