import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

async function gotoPath(page: import('@playwright/test').Page, path: string) {
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const recoverable = message.includes('ERR_ABORTED') || message.includes('frame was detached')
    if (!recoverable) throw error

    await page.waitForLoadState('domcontentloaded').catch(() => {})
  }
}

/**
 * Critical user flow smoke tests.
 * Assumes test users are seeded and app is running.
 */
test.describe('Critical flows', () => {
  test.beforeEach(() => {
    test.setTimeout(120000)
  })

  test.describe('Orders', () => {
    test('admin can view orders list', async ({ page }) => {
      await loginAs(page, 'admin')
      await gotoPath(page, '/orders')
      await expect(page).toHaveURL(/\/orders/)
      await expect(page.getByText(/trade-in|Manage|orders/i).first()).toBeVisible({ timeout: 8000 })
    })

    test('admin can navigate to new trade-in page', async ({ page }) => {
      await loginAs(page, 'admin')
      await gotoPath(page, '/orders/new/trade-in')
      await expect(page).toHaveURL(/\/orders\/new\/trade-in/)
    })

    test('admin can navigate to new CPO page', async ({ page }) => {
      await loginAs(page, 'admin')
      await gotoPath(page, '/orders/new/cpo')
      await expect(page).toHaveURL(/\/orders\/new\/cpo/)
    })

    test('sales can view orders and customers', async ({ page }) => {
      await loginAs(page, 'sales')
      await gotoPath(page, '/orders')
      await expect(page).toHaveURL(/\/orders/)
      await gotoPath(page, '/customers')
      await expect(page).toHaveURL(/\/customers/)
    })

    test('sales does not see CPO creation entry points', async ({ page }) => {
      await loginAs(page, 'sales')
      await gotoPath(page, '/orders')
      await expect(page).toHaveURL(/\/orders/)
      await expect(page.getByRole('link', { name: /new cpo/i })).toHaveCount(0)

      await gotoPath(page, '/orders/new')
      await expect(page).toHaveURL(/\/orders\/new/)
      await expect(page.getByRole('button', { name: /cpo item/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /download cpo template/i })).toHaveCount(0)
    })
  })

  test.describe('Customer', () => {
    test('customer can view dashboard', async ({ page }) => {
      await loginAs(page, 'customer')
      await gotoPath(page, '/dashboard')
      await expect(page).toHaveURL(/\/dashboard/)
      await expect(page.getByRole('heading', { name: /orders, quotes, and shipments in one view/i })).toBeVisible()
    })

    test('customer specialized order routes redirect to the unified form', async ({ page }) => {
      await loginAs(page, 'customer')

      await gotoPath(page, '/orders/new/trade-in')
      await page.waitForURL(/\/orders\/new(?:\?|$)/, { timeout: 60000, waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/orders\/new(?:\?|$)/)

      await gotoPath(page, '/orders/new/cpo')
      await page.waitForURL(/\/orders\/new(?:\?|$)/, { timeout: 60000, waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/orders\/new(?:\?|$)/)
    })

    test('customer can view My Orders', async ({ page }) => {
      await loginAs(page, 'customer')
      await gotoPath(page, '/customer/orders')
      await expect(page).toHaveURL(/\/customer\/orders/)
    })

    test('customer can view Requests', async ({ page }) => {
      await loginAs(page, 'customer')
      await gotoPath(page, '/customer/requests')
      await expect(page).toHaveURL(/\/customer\/requests/)
    })

    test('org-linked customer can create a trade-in order', async ({ page }) => {
      await loginAs(page, 'customer_org')
      await gotoPath(page, '/orders/new')
      await expect(page).toHaveURL(/\/orders\/new/)

      await page.getByRole('button', { name: /trade-in item/i }).click()

      const comboboxes = page.locator('[role="combobox"]')
      await comboboxes.nth(1).click()
      await page.getByRole('option', { name: /^Apple iPhone 13$/i }).click()
      await comboboxes.nth(3).click()
      await page.getByRole('option', { name: /^128GB$/i }).click()

      await page.getByRole('button', { name: /^create order$/i }).click()

      await page.waitForURL(/\/orders\/[0-9a-f-]+/i, { timeout: 120000, waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+/i)
    })
  })

  test.describe('Vendor', () => {
    test('vendor can view Vendor Orders', async ({ page }) => {
      await loginAs(page, 'vendor')
      await gotoPath(page, '/vendor/orders')
      await expect(page).toHaveURL(/\/vendor\/orders/)
    })

    test('vendor does not see pricing columns on Vendor Orders', async ({ page }) => {
      await loginAs(page, 'vendor')
      await gotoPath(page, '/vendor/orders')
      await expect(page).toHaveURL(/\/vendor\/orders/)
      await expect(page.getByRole('columnheader', { name: /^value$/i })).toHaveCount(0)
      await expect(page.getByRole('columnheader', { name: /^amount$/i })).toHaveCount(0)
    })
  })

  test.describe('COE', () => {
    test('coe_manager can access receiving, triage, shipping', async ({ page }) => {
      await loginAs(page, 'coe_manager')
      for (const path of ['/coe/receiving', '/coe/triage', '/coe/shipping']) {
        await gotoPath(page, path)
        await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')))
      }
    })

    test('coe_tech can access receiving and triage', async ({ page }) => {
      await loginAs(page, 'coe_tech')
      await gotoPath(page, '/coe/receiving')
      await expect(page).toHaveURL(/\/coe\/receiving/)
      await gotoPath(page, '/coe/triage')
      await expect(page).toHaveURL(/\/coe\/triage/)
    })
  })

  test.describe('Admin', () => {
    test('admin can access admin pages', async ({ page }) => {
      await loginAs(page, 'admin')
      for (const path of ['/admin/users', '/admin/organizations', '/admin/pricing']) {
        await gotoPath(page, path)
        await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')))
      }
    })
  })
})
