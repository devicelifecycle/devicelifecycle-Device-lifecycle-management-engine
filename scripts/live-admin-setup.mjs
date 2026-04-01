#!/usr/bin/env node
/**
 * Drive the live admin browser flow on the deployed app:
 * - sign in as admin
 * - create a customer organization
 * - create a vendor
 *
 * Usage:
 *   BASE_URL=https://... \
 *   ADMIN_EMAIL=... \
 *   ADMIN_PASSWORD=... \
 *   CUSTOMER_ORG_NAME=... \
 *   CUSTOMER_ORG_EMAIL=... \
 *   CUSTOMER_ORG_PHONE=... \
 *   VENDOR_COMPANY_NAME=... \
 *   VENDOR_CONTACT_NAME=... \
 *   VENDOR_CONTACT_EMAIL=... \
 *   VENDOR_CONTACT_PHONE=... \
 *   node scripts/live-admin-setup.mjs
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'https://device-lifecycle-management-engine-devcielifecycle.vercel.app'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const CUSTOMER_ORG_NAME = process.env.CUSTOMER_ORG_NAME || 'Sai Yaganti'
const CUSTOMER_ORG_EMAIL = process.env.CUSTOMER_ORG_EMAIL || 'saiyaganti14+customer@gmail.com'
const CUSTOMER_ORG_PHONE = process.env.CUSTOMER_ORG_PHONE || ''
const VENDOR_COMPANY_NAME = process.env.VENDOR_COMPANY_NAME || 'Sai Vendor Supply'
const VENDOR_CONTACT_NAME = process.env.VENDOR_CONTACT_NAME || 'Sai Yaganti'
const VENDOR_CONTACT_EMAIL = process.env.VENDOR_CONTACT_EMAIL || 'saiyaganti14@gmail.com'
const VENDOR_CONTACT_PHONE = process.env.VENDOR_CONTACT_PHONE || ''
const OUTPUT_DIR = path.join(process.cwd(), 'artifacts', 'live-admin-setup', new Date().toISOString().replace(/[:.]/g, '-'))
const HEADED = process.env.HEADED === 'true'
const SLOW_MO = Number(process.env.SLOW_MO || (HEADED ? 250 : 0))

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required.')
  process.exit(1)
}

function logStep(message) {
  console.log(`[live-admin-setup] ${message}`)
}

async function screenshot(page, name) {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const filePath = path.join(OUTPUT_DIR, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: true })
  return filePath
}

async function waitForWorkspaceReady(page) {
  await page.getByText(/Loading DLM Engine/i).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {})
}

async function login(page) {
  logStep('Opening login page')
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  logStep(`Signing in as ${ADMIN_EMAIL}`)
  await page.getByLabel(/login id/i).fill(ADMIN_EMAIL)
  await page.getByLabel(/password/i).first().fill(ADMIN_PASSWORD)
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 60000, waitUntil: 'domcontentloaded' }),
    page.getByRole('button', { name: /sign in/i }).click(),
  ])
  await waitForWorkspaceReady(page)
  await page.getByText(/Command Center/i).waitFor({ timeout: 60000 })
  logStep('Admin reached dashboard')
}

async function createOrganization(page) {
  logStep('Opening organization management')
  await page.goto(`${BASE_URL}/admin/organizations`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForWorkspaceReady(page)
  await page.getByRole('heading', { name: /organization management/i }).waitFor({ timeout: 60000 })
  await page.getByRole('button', { name: /add organization/i }).waitFor({ timeout: 60000 })
  logStep(`Creating customer organization ${CUSTOMER_ORG_NAME} (${CUSTOMER_ORG_EMAIL})`)
  await page.getByRole('button', { name: /add organization/i }).click()
  await page.getByText(/add new organization/i).waitFor({ timeout: 30000 })
  const dialog = page.getByRole('dialog')
  const dialogInputs = dialog.locator('input')
  await dialog.getByPlaceholder('Company name').fill(CUSTOMER_ORG_NAME)
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: /^Customer$/i }).click()
  await dialog.getByPlaceholder('contact@company.com').fill(CUSTOMER_ORG_EMAIL)
  if (CUSTOMER_ORG_PHONE) {
    await dialog.getByPlaceholder('+1 (555) 000-0000').fill(CUSTOMER_ORG_PHONE)
  }
  await dialog.getByPlaceholder('123 Main St').fill('123 Market Street')
  await dialogInputs.nth(4).fill('Vancouver')
  await dialogInputs.nth(5).fill('BC')
  await dialogInputs.nth(6).fill('V6B 1A1')
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/organizations') && response.request().method() === 'POST' && response.ok(), { timeout: 60000 }),
    dialog.getByRole('button', { name: /create organization/i }).click(),
  ])
  await page.getByText(CUSTOMER_ORG_NAME, { exact: false }).waitFor({ timeout: 60000 })
  logStep('Customer organization created')
  return screenshot(page, 'customer-organization-created')
}

async function createVendor(page) {
  logStep('Opening vendor creation page')
  await page.goto(`${BASE_URL}/vendors/new`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForWorkspaceReady(page)
  await page.getByRole('heading', { name: /new vendor/i }).waitFor({ timeout: 60000 })
  logStep(`Creating vendor ${VENDOR_COMPANY_NAME} (${VENDOR_CONTACT_EMAIL})`)
  await page.getByLabel(/company name/i).fill(VENDOR_COMPANY_NAME)
  await page.getByLabel(/contact name/i).fill(VENDOR_CONTACT_NAME)
  await page.getByLabel(/^Email \*/i).fill(VENDOR_CONTACT_EMAIL)
  if (VENDOR_CONTACT_PHONE) {
    await page.getByLabel(/^Phone$/i).fill(VENDOR_CONTACT_PHONE)
  }
  await page.getByLabel(/street \*/i).fill('456 Vendor Avenue')
  await page.getByLabel(/^City \*/i).fill('Toronto')
  await page.getByLabel(/state \/ province/i).fill('ON')
  await page.getByLabel(/zip \/ postal code/i).fill('M5H 2N2')
  await page.getByLabel(/country \*/i).fill('Canada')
  await Promise.all([
    page.waitForURL(/\/vendors/, { timeout: 60000, waitUntil: 'domcontentloaded' }),
    page.getByRole('button', { name: /create vendor/i }).click(),
  ])
  await page.getByText(VENDOR_COMPANY_NAME, { exact: false }).waitFor({ timeout: 60000 })
  logStep('Vendor created')
  return screenshot(page, 'vendor-created')
}

async function main() {
  logStep(`Launching browser (${HEADED ? 'headed' : 'headless'})`)
  const browser = await chromium.launch({ headless: !HEADED, slowMo: SLOW_MO })
  const context = await browser.newContext()
  const page = await context.newPage()

  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      console.log(`[browser:${message.type()}] ${message.text()}`)
    }
  })

  page.on('pageerror', (error) => {
    console.log(`[browser:pageerror] ${error.message}`)
  })

  page.on('response', (response) => {
    if (response.status() >= 400) {
      console.log(`[browser:response] ${response.status()} ${response.request().method()} ${response.url()}`)
    }
  })

  try {
    await login(page)
    const loginShot = await screenshot(page, 'admin-dashboard')
    const organizationShot = await createOrganization(page)
    const vendorShot = await createVendor(page)

    console.log(JSON.stringify({
      baseUrl: BASE_URL,
      outputDir: OUTPUT_DIR,
      adminEmail: ADMIN_EMAIL,
      customerOrganization: {
        name: CUSTOMER_ORG_NAME,
        email: CUSTOMER_ORG_EMAIL,
        phone: CUSTOMER_ORG_PHONE || null,
        screenshot: organizationShot,
      },
      vendor: {
        companyName: VENDOR_COMPANY_NAME,
        contactName: VENDOR_CONTACT_NAME,
        contactEmail: VENDOR_CONTACT_EMAIL,
        contactPhone: VENDOR_CONTACT_PHONE || null,
        screenshot: vendorShot,
      },
      adminDashboardScreenshot: loginShot,
    }, null, 2))
  } catch (error) {
    const failureShot = await screenshot(page, 'failure-state').catch(() => null)
    const pendingNavigationMarker = await page.evaluate(() => {
      try {
        return window.sessionStorage.getItem('__dlm_post_login_navigation_pending')
      } catch {
        return null
      }
    }).catch(() => null)
    const bodyTextSnippet = await page.locator('body').textContent()
      .then((text) => text?.trim().slice(0, 400) || null)
      .catch(() => null)
    console.log(JSON.stringify({
      failureScreenshot: failureShot,
      currentUrl: page.url(),
      pendingNavigationMarker,
      bodyTextSnippet,
    }, null, 2))
    throw error
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('Live admin setup failed:', error instanceof Error ? error.stack || error.message : error)
  process.exit(1)
})
