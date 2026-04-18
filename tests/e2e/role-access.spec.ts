import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './fixtures/auth'

function expectAtPath(page: { url: () => string }, path: string) {
  const pathname = new URL(page.url()).pathname
  expect(pathname.startsWith(path) || pathname === path).toBeTruthy()
}

async function gotoPath(page: Page, path: string) {
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const recoverable = message.includes('ERR_ABORTED') || message.includes('frame was detached')
    if (!recoverable) throw error

    await page.waitForLoadState('domcontentloaded').catch(() => {})
  }
}

function expectRedirectedAway(page: { url: () => string }, fromPath: string) {
  const pathname = new URL(page.url()).pathname
  // Middleware redirects unauthorized to /; authenticated users may then client-redirect to /dashboard
  expect(pathname !== fromPath).toBeTruthy()
  expect(['/', '/dashboard', ''].includes(pathname) || pathname.startsWith('/dashboard')).toBeTruthy()
}

test.describe('Role-based access', () => {
  test.beforeEach(() => {
    test.setTimeout(120000)
  })

  test.describe('admin', () => {
    test('can access /admin/users, /devices, /reports, /coe/receiving', async ({ page }) => {
      await loginAs(page, 'admin')

      for (const path of ['/admin/users', '/devices', '/reports', '/coe/receiving']) {
        await gotoPath(page, path)
        expectAtPath(page, path)
      }
    })
  })

  test.describe('coe_manager', () => {
    test('can access /coe/receiving, /devices, /reports', async ({ page }) => {
      await loginAs(page, 'coe_manager')

      for (const path of ['/coe/receiving', '/devices', '/reports']) {
        await gotoPath(page, path)
        expectAtPath(page, path)
      }
    })

    test('cannot access /admin/users', async ({ page }) => {
      await loginAs(page, 'coe_manager')
      await gotoPath(page, '/admin/users')
      expectRedirectedAway(page, '/admin/users')
    })
  })

  test.describe('coe_tech', () => {
    test('can access /coe/receiving', async ({ page }) => {
      await loginAs(page, 'coe_tech')
      await gotoPath(page, '/coe/receiving')
      expectAtPath(page, '/coe/receiving')
    })

    test('cannot access /admin/users, /devices, /reports', async ({ page }) => {
      await loginAs(page, 'coe_tech')

      for (const path of ['/admin/users', '/devices', '/reports']) {
        await gotoPath(page, path)
        expectRedirectedAway(page, path)
      }
    })
  })

  test.describe('sales', () => {
    test('can access /orders, /customers', async ({ page }) => {
      await loginAs(page, 'sales')

      for (const path of ['/orders', '/customers']) {
        await gotoPath(page, path)
        expectAtPath(page, path)
      }
    })

    test('cannot access /admin/users, /coe/receiving, /devices', async ({ page }) => {
      await loginAs(page, 'sales')

      for (const path of ['/admin/users', '/coe/receiving', '/devices']) {
        await gotoPath(page, path)
        expectRedirectedAway(page, path)
      }
    })
  })

  test.describe('customer', () => {
    test('can access /customer/orders', async ({ page }) => {
      await loginAs(page, 'customer')
      await gotoPath(page, '/customer/orders')
      expectAtPath(page, '/customer/orders')
    })

    test('cannot access /admin, /customers, /coe', async ({ page }) => {
      await loginAs(page, 'customer')

      for (const path of ['/admin/users', '/customers', '/coe/receiving']) {
        await gotoPath(page, path)
        expectRedirectedAway(page, path)
      }
    })
  })

  test.describe('customer_org (org-linked customer)', () => {
    test('can access /customer/orders and /customer/requests', async ({ page }) => {
      await loginAs(page, 'customer_org')
      await gotoPath(page, '/customer/orders')
      expectAtPath(page, '/customer/orders')
      await gotoPath(page, '/customer/requests')
      expectAtPath(page, '/customer/requests')
    })

    test('cannot access /admin, /customers, /coe, /orders (internal)', async ({ page }) => {
      await loginAs(page, 'customer_org')
      for (const path of ['/admin/users', '/customers', '/coe/receiving', '/orders']) {
        await gotoPath(page, path)
        const pathname = new URL(page.url()).pathname
        expect(pathname).not.toBe(path)
      }
    })
  })

  test.describe('vendor', () => {
    test('can access /vendor/orders', async ({ page }) => {
      await loginAs(page, 'vendor')
      await gotoPath(page, '/vendor/orders')
      expectAtPath(page, '/vendor/orders')
    })

    test('cannot access /admin, /customers, /coe', async ({ page }) => {
      await loginAs(page, 'vendor')

      for (const path of ['/admin/users', '/customers', '/coe/receiving']) {
        await gotoPath(page, path)
        expectRedirectedAway(page, path)
      }
    })
  })
})
