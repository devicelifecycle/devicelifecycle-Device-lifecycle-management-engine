import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

/**
 * Critical user flow smoke tests.
 * Assumes test users are seeded and app is running.
 */
test.describe('Critical flows', () => {
  test.describe('Orders', () => {
    test('admin can view orders list', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/orders')
      await expect(page).toHaveURL(/\/orders/)
      await expect(page.getByText(/trade-in|Manage|orders/i).first()).toBeVisible({ timeout: 8000 })
    })

    test('admin can navigate to new trade-in page', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/orders/new/trade-in')
      await expect(page).toHaveURL(/\/orders\/new\/trade-in/)
    })

    test('admin can navigate to new CPO page', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto('/orders/new/cpo')
      await expect(page).toHaveURL(/\/orders\/new\/cpo/)
    })

    test('sales can view orders and customers', async ({ page }) => {
      await loginAs(page, 'sales')
      await page.goto('/orders')
      await expect(page).toHaveURL(/\/orders/)
      await page.goto('/customers')
      await expect(page).toHaveURL(/\/customers/)
    })

    test('sales does not see CPO creation entry points', async ({ page }) => {
      test.setTimeout(60000)
      await loginAs(page, 'sales')
      await page.goto('/orders', { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/orders/)
      await expect(page.getByRole('link', { name: /new cpo/i })).toHaveCount(0)

      await page.goto('/orders/new', { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/orders\/new/)
      await expect(page.getByRole('button', { name: /cpo item/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /download cpo template/i })).toHaveCount(0)
    })
  })

  test.describe('Customer', () => {
    test('customer can view My Orders', async ({ page }) => {
      await loginAs(page, 'customer')
      await page.goto('/customer/orders')
      await expect(page).toHaveURL(/\/customer\/orders/)
    })

    test('customer can view Requests', async ({ page }) => {
      await loginAs(page, 'customer')
      await page.goto('/customer/requests')
      await expect(page).toHaveURL(/\/customer\/requests/)
    })

    test('org-linked customer can create a trade-in order', async ({ page }) => {
      test.setTimeout(90000)
      await loginAs(page, 'acme')
      await page.goto('/orders/new', { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/orders\/new/)

      await page.getByRole('button', { name: /trade-in item/i }).click()

      const comboboxes = page.locator('[role="combobox"]')
      await comboboxes.nth(1).click()
      await page.getByRole('option').first().click()

      await page.getByRole('button', { name: /^create order$/i }).click()

      await page.waitForURL(/\/orders\/[0-9a-f-]+/i, { timeout: 60000, waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+/i)
    })
  })

  test.describe('Vendor', () => {
    test('vendor can view Vendor Orders', async ({ page }) => {
      await loginAs(page, 'vendor')
      await page.goto('/vendor/orders')
      await expect(page).toHaveURL(/\/vendor\/orders/)
    })

    test('vendor does not see pricing columns on Vendor Orders', async ({ page }) => {
      await loginAs(page, 'vendor')
      await page.goto('/vendor/orders')
      await expect(page).toHaveURL(/\/vendor\/orders/)
      await expect(page.getByRole('columnheader', { name: /^value$/i })).toHaveCount(0)
      await expect(page.getByRole('columnheader', { name: /^amount$/i })).toHaveCount(0)
    })
  })

  test.describe('COE', () => {
    test('coe_manager can access receiving, triage, shipping', async ({ page }) => {
      test.setTimeout(60000)
      await loginAs(page, 'coe_manager')
      for (const path of ['/coe/receiving', '/coe/triage', '/coe/shipping']) {
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')))
      }
    })

    test('coe_tech can access receiving and triage', async ({ page }) => {
      test.setTimeout(60000)
      await loginAs(page, 'coe_tech')
      await page.goto('/coe/receiving', { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/coe\/receiving/)
      await page.goto('/coe/triage', { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/coe\/triage/)
    })
  })

  test.describe('Admin', () => {
    test('admin can access admin pages', async ({ page }) => {
      test.setTimeout(60000)
      await loginAs(page, 'admin')
      for (const path of ['/admin/users', '/admin/organizations', '/admin/pricing']) {
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')))
      }
    })
  })
})
