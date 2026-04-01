#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.BASE_URL || 'https://device-lifecycle-management-engine-devcielifecycle.vercel.app'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'devicelifecycel@gmail.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Dlm12345!'
const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL || 'saiyaganti14+customer@gmail.com'
const CUSTOMER_PASSWORD = process.env.CUSTOMER_PASSWORD || 'DLM-aOeLbykK8txV!9a'
const VENDOR_EMAIL = process.env.VENDOR_EMAIL || 'saiyaganti14@gmail.com'
const VENDOR_PASSWORD = process.env.VENDOR_PASSWORD || 'Dlm-aAb-d2-3Mi0c!9a'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const HEADED = process.env.HEADED === 'true'
const SLOW_MO = Number(process.env.SLOW_MO || (HEADED ? 250 : 0))
const OUTPUT_DIR = path.join(
  process.cwd(),
  'artifacts',
  'live-workflow-check',
  new Date().toISOString().replace(/[:.]/g, '-'),
)

if (!CUSTOMER_PASSWORD || !VENDOR_PASSWORD) {
  console.error('CUSTOMER_PASSWORD and VENDOR_PASSWORD are required.')
  process.exit(1)
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function logStep(message) {
  console.log(`[live-workflow] ${message}`)
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function ensureOutputDir() {
  await mkdir(OUTPUT_DIR, { recursive: true })
}

async function screenshot(page, name) {
  await ensureOutputDir()
  const filePath = path.join(OUTPUT_DIR, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: true })
  return filePath
}

async function writeJson(name, value) {
  await ensureOutputDir()
  const filePath = path.join(OUTPUT_DIR, `${name}.json`)
  await writeFile(filePath, JSON.stringify(value, null, 2))
  return filePath
}

async function waitForWorkspaceReady(page) {
  await page.getByText(/Loading DLM Engine/i).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {})
}

function attachPageObservers(page, actor) {
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      console.log(`[browser:${actor}:${message.type()}] ${message.text()}`)
    }
  })

  page.on('pageerror', (error) => {
    console.log(`[browser:${actor}:pageerror] ${error.message}`)
  })

  page.on('response', (response) => {
    if (response.status() >= 400) {
      console.log(`[browser:${actor}:response] ${response.status()} ${response.request().method()} ${response.url()}`)
    }
  })
}

async function newActorPage(browser, actor) {
  const context = await browser.newContext()
  const page = await context.newPage()
  attachPageObservers(page, actor)
  return { context, page }
}

async function login(page, { email, password, actor, waitForText }) {
  logStep(`${actor}: opening login page`)
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByLabel(/login id/i).fill(email)
  await page.getByLabel(/password/i).first().fill(password)
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 60000, waitUntil: 'domcontentloaded' }),
    page.getByRole('button', { name: /sign in/i }).click(),
  ])
  await waitForWorkspaceReady(page)
  if (waitForText) {
    try {
      await page.getByText(waitForText).waitFor({ timeout: 15000 })
    } catch {
      await page.locator('h1').first().waitFor({ timeout: 45000 })
    }
  } else {
    await page.locator('h1').first().waitFor({ timeout: 60000 })
  }
  logStep(`${actor}: signed in`)
}

async function selectComboboxOption(page, trigger, optionText) {
  await trigger.click()
  const option = page.getByRole('option', { name: new RegExp(escapeRegex(optionText), 'i') }).first()
  await option.waitFor({ timeout: 15000 })
  await option.click()
}

async function fetchUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, organization_id, notification_email')
    .eq('email', email)
    .single()

  if (error || !data) {
    throw new Error(`Unable to load user for ${email}: ${error?.message || 'not found'}`)
  }

  return data
}

async function fetchCustomerByEmail(email) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, company_name, contact_email, organization_id')
    .eq('contact_email', email)
    .single()

  if (error || !data) {
    throw new Error(`Unable to load customer for ${email}: ${error?.message || 'not found'}`)
  }

  return data
}

async function fetchVendorByEmail(email) {
  const { data, error } = await supabase
    .from('vendors')
    .select('id, company_name, contact_email, organization_id')
    .eq('contact_email', email)
    .single()

  if (error || !data) {
    throw new Error(`Unable to load vendor for ${email}: ${error?.message || 'not found'}`)
  }

  return data
}

async function fetchDeviceChoice() {
  const { data, error } = await supabase
    .from('device_catalog')
    .select('id, make, model')
    .or('model.ilike.%iPhone%,model.ilike.%Galaxy%')
    .order('make', { ascending: true })
    .order('model', { ascending: true })
    .limit(10)

  if (error || !data || data.length === 0) {
    throw new Error(`Unable to load device catalog choice: ${error?.message || 'no devices found'}`)
  }

  return data.find((entry) => /iphone|galaxy/i.test(entry.model || '')) || data[0]
}

async function fetchOrder(orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      items:order_items(*),
      customer:customers(*),
      vendor:vendors(*)
    `)
    .eq('id', orderId)
    .single()

  if (error || !data) {
    throw new Error(`Unable to load order ${orderId}: ${error?.message || 'not found'}`)
  }

  return data
}

async function fetchOrderNotifications({ userId, orderId }) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, metadata, created_at, is_read')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(`Unable to load notifications: ${error.message}`)
  }

  return (data || []).filter((notification) => {
    const metadata = notification.metadata || {}
    return metadata.order_id === orderId
  })
}

async function fetchPendingImeiRecord(orderId) {
  const { data, error } = await supabase
    .from('imei_records')
    .select('id, imei, claimed_condition, triage_status, order_id')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error(`Unable to load IMEI record for order ${orderId}: ${error?.message || 'not found'}`)
  }

  return data
}

async function createManualOrder(page, {
  orderType,
  deviceLabel,
  quantity,
  condition,
  storage,
  serialNumber,
  color,
  orderNotes,
  itemNotes,
}) {
  logStep(`customer: creating manual ${orderType} order`)
  await page.goto(`${BASE_URL}/orders/new`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForWorkspaceReady(page)
  await page.getByRole('heading', { name: /new order/i }).waitFor({ timeout: 60000 })

  const addButtonName = orderType === 'trade_in' ? /trade-in item/i : /^cpo item$/i
  await page.getByRole('button', { name: addButtonName }).click()

  const form = page.locator('form').first()
  const combos = form.locator('[role="combobox"]')
  const deviceComboIndex = 1
  const conditionComboIndex = orderType === 'trade_in' ? 2 : null
  const storageComboIndex = orderType === 'trade_in' ? 3 : 2

  await selectComboboxOption(page, combos.nth(deviceComboIndex), deviceLabel)

  const numberInputs = form.locator('input[type="number"]')
  await numberInputs.first().fill(String(quantity))

  if (conditionComboIndex != null) {
    await selectComboboxOption(page, combos.nth(conditionComboIndex), condition)
  }

  await selectComboboxOption(page, combos.nth(storageComboIndex), storage)

  if (orderType === 'trade_in') {
    await form.getByPlaceholder(/imei \/ serial number/i).fill(serialNumber)
    await form.getByPlaceholder(/color/i).fill(color)
    await form.getByPlaceholder(/notes \(optional\)/i).fill(itemNotes)
  }

  await form.getByPlaceholder(/any additional notes/i).fill(orderNotes)

  const responsePromise = page.waitForResponse((response) => (
    response.url().endsWith('/api/orders') &&
    response.request().method() === 'POST' &&
    response.status() === 201
  ), { timeout: 60000 })

  await page.getByRole('button', { name: /^create order$/i }).click()
  const response = await responsePromise
  const payload = await response.json()
  await page.waitForURL(/\/orders\//, { timeout: 60000, waitUntil: 'domcontentloaded' })
  await page.getByText(payload.order_number || payload.id, { exact: false }).waitFor({ timeout: 60000 }).catch(() => {})

  const orderId = payload.id
  const orderNumber = payload.order_number
  const shot = await screenshot(page, `customer-manual-${orderType}-${orderNumber || orderId}`)

  return { orderId, orderNumber, screenshot: shot }
}

async function createCsvOrder(page, {
  orderType,
  filename,
  csv,
}) {
  logStep(`customer: creating CSV ${orderType} order`)
  await page.goto(`${BASE_URL}/orders/new`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForWorkspaceReady(page)
  await page.getByRole('heading', { name: /new order/i }).waitFor({ timeout: 60000 })
  await page.getByRole('tab', { name: /csv upload/i }).click()

  const fileInput = page.locator('input[type="file"][accept=".csv"]').first()
  await fileInput.setInputFiles({
    name: filename,
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  })

  await page.getByText(filename, { exact: false }).waitFor({ timeout: 60000 })

  const responsePromise = page.waitForResponse((response) => (
    response.url().endsWith('/api/orders/upload-csv') &&
    response.request().method() === 'POST' &&
    response.ok()
  ), { timeout: 60000 })

  await page.getByRole('button', { name: /^create order$/i }).click()
  const response = await responsePromise
  const payload = await response.json()
  const order = payload.order

  if (!order?.id) {
    throw new Error(`CSV ${orderType} order response did not contain an order object`)
  }

  await page.waitForURL(new RegExp(`/orders/${order.id}`), { timeout: 60000, waitUntil: 'domcontentloaded' })
  const shot = await screenshot(page, `customer-csv-${orderType}-${order.order_number || order.id}`)

  return { orderId: order.id, orderNumber: order.order_number, screenshot: shot }
}

async function openOrder(page, orderId) {
  await page.goto(`${BASE_URL}/orders/${orderId}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForWorkspaceReady(page)
  await page.locator('h1').first().waitFor({ timeout: 60000 })
}

async function adminSetPriceAndSendQuote(page, { orderId, unitPrice }) {
  logStep(`admin: pricing order ${orderId}`)
  await openOrder(page, orderId)

  await page.getByRole('button', { name: /^set pricing$/i }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: /set item pricing/i }).waitFor({ timeout: 30000 })

  const priceInput = dialog.locator('input[type="number"]').first()
  await priceInput.fill(String(unitPrice))

  const savePricesResponse = page.waitForResponse((response) => (
    response.url().includes(`/api/orders/${orderId}/items`) &&
    response.request().method() === 'PATCH'
  ), { timeout: 60000 })
  await dialog.getByRole('button', { name: /^save prices$/i }).click()
  await savePricesResponse
  await dialog.waitFor({ state: 'hidden', timeout: 30000 })

  const sendQuoteResponse = page.waitForResponse((response) => (
    response.url().includes(`/api/orders/${orderId}/transition`) &&
    response.request().method() === 'POST' &&
    response.ok()
  ), { timeout: 60000 })
  await page.getByRole('button', { name: /^send quote$/i }).click()
  await sendQuoteResponse
  await page.getByText(/quoted/i).waitFor({ timeout: 60000 })

  return screenshot(page, `admin-quoted-${orderId}`)
}

async function adminTransition(page, { orderId, buttonName, note = '' }) {
  logStep(`admin: transitioning order ${orderId} with action "${buttonName}"`)
  await openOrder(page, orderId)

  await page.getByRole('button', { name: new RegExp(`^${escapeRegex(buttonName)}$`, 'i') }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.waitFor({ timeout: 30000 })
  if (note) {
    await dialog.getByPlaceholder(/add a note/i).fill(note)
  }

  const transitionResponse = page.waitForResponse((response) => (
    response.url().includes(`/api/orders/${orderId}/transition`) &&
    response.request().method() === 'POST'
  ), { timeout: 60000 })
  await dialog.getByRole('button', { name: /^confirm$/i }).click()
  await transitionResponse
  await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})

  return screenshot(page, `admin-transition-${buttonName.toLowerCase().replace(/\s+/g, '-')}-${orderId}`)
}

async function customerDecision(page, { orderId, approve, note = '' }) {
  logStep(`customer: ${approve ? 'approving' : 'declining'} quote for ${orderId}`)
  await openOrder(page, orderId)

  const buttonName = approve ? 'Approve' : 'Disapprove'
  await page.getByRole('button', { name: new RegExp(`^${buttonName}$`, 'i') }).click()

  const dialog = page.getByRole('alertdialog')
  await dialog.waitFor({ timeout: 30000 })
  if (note) {
    await dialog.getByPlaceholder(/add a note/i).fill(note)
  }

  const transitionResponse = page.waitForResponse((response) => (
    response.url().includes(`/api/orders/${orderId}/transition`) &&
    response.request().method() === 'POST' &&
    response.ok()
  ), { timeout: 60000 })
  await dialog.getByRole('button', { name: /^confirm$/i }).click()
  await transitionResponse
  await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})

  return screenshot(page, `customer-${approve ? 'approved' : 'declined'}-${orderId}`)
}

async function customerCreateShipment(page, { orderId, trackingNumber, carrier = 'FedEx', notes = '' }) {
  logStep(`customer: creating shipment for ${orderId}`)
  await openOrder(page, orderId)

  await page.getByRole('button', { name: /^create shipment$/i }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: /create shipment/i }).waitFor({ timeout: 30000 })

  const switches = dialog.locator('button[role="switch"]')
  if ((await switches.count()) > 0) {
    const purchaseSwitch = switches.first()
    const checked = await purchaseSwitch.getAttribute('aria-checked')
    if (checked !== 'false') {
      await purchaseSwitch.click()
    }
  }

  const combos = dialog.locator('[role="combobox"]')
  if ((await combos.count()) >= 2) {
    await selectComboboxOption(page, combos.nth(1), carrier)
  }

  await dialog.getByLabel(/tracking number/i).fill(trackingNumber)
  if (notes) {
    await dialog.getByLabel(/notes/i).fill(notes)
  }

  const createShipmentResponse = page.waitForResponse((response) => (
    response.url().endsWith('/api/shipments') &&
    response.request().method() === 'POST' &&
    response.ok()
  ), { timeout: 60000 })
  await dialog.getByRole('button', { name: /^create shipment$/i }).click()
  await createShipmentResponse
  await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})

  return screenshot(page, `customer-shipment-${orderId}`)
}

async function coeReceiveShipment(page, { trackingNumber }) {
  logStep(`admin: receiving shipment ${trackingNumber}`)
  await page.goto(`${BASE_URL}/coe/receiving`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForWorkspaceReady(page)
  await page.getByRole('heading', { name: /receiving/i }).waitFor({ timeout: 60000 })

  await page.getByPlaceholder(/search by tracking number/i).fill(trackingNumber)
  const row = page.locator('tr').filter({ hasText: trackingNumber }).first()
  await row.waitFor({ timeout: 60000 })
  await row.getByRole('button', { name: /mark received/i }).click()

  const dialog = page.getByRole('dialog')
  await dialog.waitFor({ timeout: 30000 })
  await dialog.getByPlaceholder(/notes/i).fill('Received during live workflow verification')

  const receiveResponse = page.waitForResponse((response) => (
    response.url().includes('/api/shipments/') &&
    response.request().method() === 'PATCH' &&
    response.ok()
  ), { timeout: 60000 })
  await dialog.getByRole('button', { name: /mark as received/i }).click()
  await receiveResponse
  await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})

  return screenshot(page, `coe-received-${trackingNumber}`)
}

async function triagePendingDevice(page, { imei, physicalCondition = 'fair', screenCondition = 'cracked', batteryHealth = '75', notes = '' }) {
  logStep(`admin: triaging IMEI ${imei}`)
  await page.goto(`${BASE_URL}/coe/triage`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForWorkspaceReady(page)
  await page.getByRole('heading', { name: /triage/i }).waitFor({ timeout: 60000 })

  await page.getByPlaceholder(/search by imei/i).fill(imei)
  const row = page.locator('tr').filter({ hasText: imei }).first()
  await row.waitFor({ timeout: 60000 })
  await row.getByRole('button', { name: /^triage$/i }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: /device triage/i }).waitFor({ timeout: 30000 })

  const checklistButtons = dialog.locator('button').filter({ hasText: /power|screen|touch|button|speaker|camera|wifi|cellular/i })
  const checklistCount = await checklistButtons.count()
  for (let index = 0; index < Math.min(checklistCount, 4); index += 1) {
    await checklistButtons.nth(index).click()
  }

  const combos = dialog.locator('[role="combobox"]')
  await selectComboboxOption(page, combos.nth(0), physicalCondition === 'fair' ? 'Fair' : 'Poor')
  await selectComboboxOption(page, combos.nth(1), screenCondition)
  await dialog.getByLabel(/battery health/i).fill(batteryHealth)
  if (notes) {
    await dialog.getByLabel(/technician notes/i).fill(notes)
  }

  const triageResponse = page.waitForResponse((response) => (
    response.url().endsWith('/api/triage') &&
    response.request().method() === 'POST' &&
    response.ok()
  ), { timeout: 60000 })
  await dialog.getByRole('button', { name: /submit triage/i }).click()
  await triageResponse
  await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})

  return screenshot(page, `coe-triage-${imei}`)
}

async function customerExceptionDecision(page, { orderId, approve }) {
  logStep(`customer: ${approve ? 'approving' : 'rejecting'} triage exception for ${orderId}`)
  await openOrder(page, orderId)

  const buttonName = approve ? /^approve$/i : /^reject$/i
  const responsePromise = page.waitForResponse((response) => (
    /\/api\/triage\/.+\/exception$/.test(response.url()) &&
    response.request().method() === 'POST' &&
    response.ok()
  ), { timeout: 60000 })

  await page.getByRole('button', { name: buttonName }).first().click()
  await responsePromise

  return screenshot(page, `customer-exception-${approve ? 'approved' : 'rejected'}-${orderId}`)
}

async function vendorSubmitBid(page, { orderNumber, quantity, unitPrice, leadTimeDays, notes }) {
  logStep(`vendor: submitting bid for ${orderNumber}`)
  await page.goto(`${BASE_URL}/vendor/orders`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForWorkspaceReady(page)
  await page.getByRole('heading', { name: /vendor orders/i }).waitFor({ timeout: 60000 })

  const row = page.locator('tr').filter({ hasText: orderNumber }).first()
  await row.waitFor({ timeout: 60000 })
  await row.getByRole('button', { name: /submit bid/i }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: /submit bid/i }).waitFor({ timeout: 30000 })
  await dialog.locator('#bid-quantity').fill(String(quantity))
  await dialog.locator('#bid-unit-price').fill(String(unitPrice))
  await dialog.locator('#bid-lead-time').fill(String(leadTimeDays))
  await dialog.locator('#bid-notes').fill(notes)

  const bidResponse = page.waitForResponse((response) => (
    response.url().endsWith('/api/vendors/bids') &&
    response.request().method() === 'POST' &&
    response.ok()
  ), { timeout: 60000 })
  await dialog.getByRole('button', { name: /^submit bid$/i }).click()
  await bidResponse
  await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})

  return screenshot(page, `vendor-bid-${orderNumber}`)
}

async function adminBidDecision(page, { orderId, accept, markupPercent = '15' }) {
  logStep(`admin: ${accept ? 'accepting' : 'rejecting'} vendor bid for ${orderId}`)
  await openOrder(page, orderId)

  const buttonName = accept ? /^accept$/i : /^reject$/i
  await page.getByRole('button', { name: buttonName }).first().click()

  if (accept) {
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('heading', { name: /accept vendor bid/i }).waitFor({ timeout: 30000 })
    await dialog.locator('#bid-markup').fill(markupPercent)
    const responsePromise = page.waitForResponse((response) => (
      /\/api\/vendors\/bids\/.+$/.test(response.url()) &&
      response.request().method() === 'PATCH' &&
      response.ok()
    ), { timeout: 60000 })
    await dialog.getByRole('button', { name: /^accept bid$/i }).click()
    await responsePromise
    await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
  } else {
    const dialog = page.getByRole('alertdialog')
    await dialog.waitFor({ timeout: 30000 })
    const responsePromise = page.waitForResponse((response) => (
      /\/api\/vendors\/bids\/.+$/.test(response.url()) &&
      response.request().method() === 'PATCH' &&
      response.ok()
    ), { timeout: 60000 })
    await dialog.getByRole('button', { name: /^reject bid$/i }).click()
    await responsePromise
    await dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
  }

  return screenshot(page, `admin-bid-${accept ? 'accepted' : 'rejected'}-${orderId}`)
}

async function runCustomerActor(browser, action) {
  const { context, page } = await newActorPage(browser, 'customer')
  try {
    await login(page, {
      email: CUSTOMER_EMAIL,
      password: CUSTOMER_PASSWORD,
      actor: 'customer',
      waitForText: /welcome back|requests|my orders|device journey/i,
    })
    return await action(page)
  } finally {
    await context.close()
  }
}

async function runAdminActor(browser, action) {
  const { context, page } = await newActorPage(browser, 'admin')
  try {
    await login(page, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      actor: 'admin',
      waitForText: /command center|device journey|dashboard/i,
    })
    return await action(page)
  } finally {
    await context.close()
  }
}

async function runVendorActor(browser, action) {
  const { context, page } = await newActorPage(browser, 'vendor')
  try {
    await login(page, {
      email: VENDOR_EMAIL,
      password: VENDOR_PASSWORD,
      actor: 'vendor',
      waitForText: /vendor orders|device journey|dashboard/i,
    })
    return await action(page)
  } finally {
    await context.close()
  }
}

async function main() {
  const adminUser = await fetchUserByEmail(ADMIN_EMAIL)
  const customerUser = await fetchUserByEmail(CUSTOMER_EMAIL)
  const vendorUser = await fetchUserByEmail(VENDOR_EMAIL)
  const customer = await fetchCustomerByEmail(CUSTOMER_EMAIL)
  const vendor = await fetchVendorByEmail(VENDOR_EMAIL)
  const device = await fetchDeviceChoice()
  const deviceLabel = `${device.make} ${device.model}`
  const runId = new Date().toISOString().replace(/[:.]/g, '-')

  const manualTradeInSerial = `TI-${runId.slice(-8)}`
  const csvTradeInSerial = `TICSV-${runId.slice(-8)}`
  const tradeInTracking = `FDX-${runId.slice(-10)}`

  const browser = await chromium.launch({ headless: !HEADED, slowMo: SLOW_MO })
  const summary = {
    baseUrl: BASE_URL,
    outputDir: OUTPUT_DIR,
    actors: {
      admin: { email: ADMIN_EMAIL, userId: adminUser.id },
      customer: { email: CUSTOMER_EMAIL, userId: customerUser.id, customerId: customer.id },
      vendor: { email: VENDOR_EMAIL, userId: vendorUser.id, vendorId: vendor.id },
    },
    device: { id: device.id, label: deviceLabel },
    flows: {},
  }

  try {
    logStep(`Launching browser (${HEADED ? 'headed' : 'headless'})`)

    const manualTradeIn = await runCustomerActor(browser, (page) => createManualOrder(page, {
      orderType: 'trade_in',
      deviceLabel,
      quantity: 1,
      condition: 'Excellent',
      storage: '128GB',
      serialNumber: manualTradeInSerial,
      color: 'Midnight',
      orderNotes: `Live workflow manual trade-in ${runId}`,
      itemNotes: 'Manual trade-in verification item',
    }))
    summary.flows.manualTradeIn = { create: manualTradeIn }

    const pricedTradeInShot = await runAdminActor(browser, (page) => adminSetPriceAndSendQuote(page, {
      orderId: manualTradeIn.orderId,
      unitPrice: 850,
    }))
    summary.flows.manualTradeIn.quote = { screenshot: pricedTradeInShot }

    const manualTradeInAccepted = await runCustomerActor(browser, async (page) => {
      const decisionShot = await customerDecision(page, {
        orderId: manualTradeIn.orderId,
        approve: true,
        note: 'Accepting manual trade-in quote during live verification',
      })
      const shipmentShot = await customerCreateShipment(page, {
        orderId: manualTradeIn.orderId,
        trackingNumber: tradeInTracking,
        notes: 'Shipment submitted during live verification',
      })
      return { decisionShot, shipmentShot }
    })
    summary.flows.manualTradeIn.accepted = manualTradeInAccepted

    const manualTradeInInternalShots = await runAdminActor(browser, async (page) => {
      const sourcedShot = await adminTransition(page, {
        orderId: manualTradeIn.orderId,
        buttonName: 'Sourced',
        note: 'Devices shipped by customer and ready for COE intake',
      })
      const shippedToCoeShot = await adminTransition(page, {
        orderId: manualTradeIn.orderId,
        buttonName: 'Shipped to COE',
        note: 'Shipment in transit to COE',
      })
      const receiveShot = await coeReceiveShipment(page, { trackingNumber: tradeInTracking })
      return { sourcedShot, shippedToCoeShot, receiveShot }
    })
    summary.flows.manualTradeIn.logistics = manualTradeInInternalShots

    const imeiRecord = await fetchPendingImeiRecord(manualTradeIn.orderId)
    const triageShot = await runAdminActor(browser, (page) => triagePendingDevice(page, {
      imei: imeiRecord.imei,
      physicalCondition: 'fair',
      screenCondition: 'cracked',
      batteryHealth: '72',
      notes: 'Forcing exception path during live verification',
    }))
    summary.flows.manualTradeIn.triage = { imei: imeiRecord.imei, screenshot: triageShot }

    const exceptionShot = await runCustomerActor(browser, (page) => customerExceptionDecision(page, {
      orderId: manualTradeIn.orderId,
      approve: true,
    }))
    summary.flows.manualTradeIn.exception = { approved: true, screenshot: exceptionShot }

    const csvTradeIn = await runCustomerActor(browser, (page) => createCsvOrder(page, {
      orderType: 'trade_in',
      filename: 'trade-in-live.csv',
      csv: [
        'device_make,device_model,quantity,condition,storage,serial_number,color,notes',
        `${device.make},${device.model},1,excellent,128GB,${csvTradeInSerial},Silver,CSV trade-in verification item`,
      ].join('\n'),
    }))
    summary.flows.csvTradeIn = { create: csvTradeIn }

    const csvTradeInQuoteShot = await runAdminActor(browser, (page) => adminSetPriceAndSendQuote(page, {
      orderId: csvTradeIn.orderId,
      unitPrice: 780,
    }))
    summary.flows.csvTradeIn.quote = { screenshot: csvTradeInQuoteShot }

    const csvTradeInRejectShot = await runCustomerActor(browser, (page) => customerDecision(page, {
      orderId: csvTradeIn.orderId,
      approve: false,
      note: 'Declining CSV trade-in quote during verification',
    }))
    summary.flows.csvTradeIn.decision = { approved: false, screenshot: csvTradeInRejectShot }

    const manualCpo = await runCustomerActor(browser, (page) => createManualOrder(page, {
      orderType: 'cpo',
      deviceLabel,
      quantity: 5,
      condition: 'Excellent',
      storage: '128GB',
      serialNumber: '',
      color: '',
      orderNotes: `Live workflow manual CPO ${runId}`,
      itemNotes: '',
    }))
    summary.flows.manualCpo = { create: manualCpo }

    const manualCpoAdminPrep = await runAdminActor(browser, async (page) => {
      const submitShot = await adminTransition(page, {
        orderId: manualCpo.orderId,
        buttonName: 'Submitted',
        note: 'Submitted for vendor sourcing',
      })
      const sourcingShot = await adminTransition(page, {
        orderId: manualCpo.orderId,
        buttonName: 'Sourcing',
        note: 'Opening order for vendor bidding',
      })
      return { submitShot, sourcingShot }
    })
    summary.flows.manualCpo.prep = manualCpoAdminPrep

    const manualCpoOrder = await fetchOrder(manualCpo.orderId)
    const manualCpoBidShot = await runVendorActor(browser, (page) => vendorSubmitBid(page, {
      orderNumber: manualCpoOrder.order_number,
      quantity: 4,
      unitPrice: 520,
      leadTimeDays: 5,
      notes: 'Manual CPO verification bid',
    }))
    summary.flows.manualCpo.bid = { screenshot: manualCpoBidShot }

    const manualCpoAcceptShot = await runAdminActor(browser, (page) => adminBidDecision(page, {
      orderId: manualCpo.orderId,
      accept: true,
      markupPercent: '12',
    }))
    summary.flows.manualCpo.bidDecision = { accepted: true, screenshot: manualCpoAcceptShot }

    const manualCpoCustomerAcceptShot = await runCustomerActor(browser, (page) => customerDecision(page, {
      orderId: manualCpo.orderId,
      approve: true,
      note: 'Accepting manual CPO quote during verification',
    }))
    summary.flows.manualCpo.customerDecision = { approved: true, screenshot: manualCpoCustomerAcceptShot }

    const csvCpo = await runCustomerActor(browser, (page) => createCsvOrder(page, {
      orderType: 'cpo',
      filename: 'cpo-live.csv',
      csv: [
        'device_make,device_model,quantity,condition,storage,notes',
        `${device.make},${device.model},3,good,128GB,CSV CPO verification item`,
      ].join('\n'),
    }))
    summary.flows.csvCpo = { create: csvCpo }

    const csvCpoAdminPrep = await runAdminActor(browser, async (page) => {
      const submitShot = await adminTransition(page, {
        orderId: csvCpo.orderId,
        buttonName: 'Submitted',
        note: 'Submitted CSV CPO order for sourcing',
      })
      const sourcingShot = await adminTransition(page, {
        orderId: csvCpo.orderId,
        buttonName: 'Sourcing',
        note: 'Opening CSV CPO order for vendor bids',
      })
      return { submitShot, sourcingShot }
    })
    summary.flows.csvCpo.prep = csvCpoAdminPrep

    const csvCpoOrder = await fetchOrder(csvCpo.orderId)
    const csvCpoBidShot = await runVendorActor(browser, (page) => vendorSubmitBid(page, {
      orderNumber: csvCpoOrder.order_number,
      quantity: 2,
      unitPrice: 505,
      leadTimeDays: 7,
      notes: 'CSV CPO verification bid',
    }))
    summary.flows.csvCpo.bid = { screenshot: csvCpoBidShot }

    const csvCpoRejectShot = await runAdminActor(browser, (page) => adminBidDecision(page, {
      orderId: csvCpo.orderId,
      accept: false,
    }))
    summary.flows.csvCpo.bidDecision = { accepted: false, screenshot: csvCpoRejectShot }

    summary.orders = {
      manualTradeIn: await fetchOrder(manualTradeIn.orderId),
      csvTradeIn: await fetchOrder(csvTradeIn.orderId),
      manualCpo: await fetchOrder(manualCpo.orderId),
      csvCpo: await fetchOrder(csvCpo.orderId),
    }

    summary.notifications = {
      customerManualTradeIn: await fetchOrderNotifications({ userId: customerUser.id, orderId: manualTradeIn.orderId }),
      customerCsvTradeIn: await fetchOrderNotifications({ userId: customerUser.id, orderId: csvTradeIn.orderId }),
      customerManualCpo: await fetchOrderNotifications({ userId: customerUser.id, orderId: manualCpo.orderId }),
      customerCsvCpo: await fetchOrderNotifications({ userId: customerUser.id, orderId: csvCpo.orderId }),
      vendorManualCpo: await fetchOrderNotifications({ userId: vendorUser.id, orderId: manualCpo.orderId }),
      vendorCsvCpo: await fetchOrderNotifications({ userId: vendorUser.id, orderId: csvCpo.orderId }),
      adminManualTradeIn: await fetchOrderNotifications({ userId: adminUser.id, orderId: manualTradeIn.orderId }),
      adminManualCpo: await fetchOrderNotifications({ userId: adminUser.id, orderId: manualCpo.orderId }),
    }

    const summaryPath = await writeJson('summary', summary)
    console.log(JSON.stringify({ ...summary, summaryPath }, null, 2))
  } catch (error) {
    const failure = {
      outputDir: OUTPUT_DIR,
      error: error instanceof Error ? error.stack || error.message : String(error),
    }
    await writeJson('failure', failure).catch(() => {})
    console.error('Live workflow check failed:', failure.error)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('Live workflow check crashed:', error instanceof Error ? error.stack || error.message : error)
  process.exit(1)
})
