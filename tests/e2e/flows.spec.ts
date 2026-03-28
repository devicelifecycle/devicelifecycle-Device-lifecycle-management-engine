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
  })

  test.describe('Vendor', () => {
    test('vendor can view Vendor Orders', async ({ page }) => {
      await loginAs(page, 'vendor')
      await page.goto('/vendor/orders')
      await expect(page).toHaveURL(/\/vendor\/orders/)
    })
  })

  test.describe('COE', () => {
    test('coe_manager can access receiving, triage, shipping', async ({ page }) => {
      await loginAs(page, 'coe_manager')
      for (const path of ['/coe/receiving', '/coe/triage', '/coe/shipping']) {
        await page.goto(path)
        await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')))
      }
    })

    test('coe_tech can access receiving and triage', async ({ page }) => {
      await loginAs(page, 'coe_tech')
      await page.goto('/coe/receiving')
      await expect(page).toHaveURL(/\/coe\/receiving/)
      await page.goto('/coe/triage')
      await expect(page).toHaveURL(/\/coe\/triage/)
    })
  })

  test.describe('Admin', () => {
    test('admin can access admin pages', async ({ page }) => {
      await loginAs(page, 'admin')
      for (const path of ['/admin/users', '/admin/organizations', '/admin/pricing']) {
        await page.goto(path)
        await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')))
      }
    })
  })
})
