import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAs } from './fixtures/auth'
import { loadE2EEnv } from './env'

/**
 * VAR → customer invoicing (Billing Option A and Option B), end to end against
 * a real signed-in session.
 *
 * Creates a disposable tenant, customer and two closed orders via the service
 * role, drives the API as the platform admin (temporarily moved into that
 * tenant so requireAuth resolves to it), and removes everything afterwards.
 * Nothing it touches belongs to a real tenant.
 */

loadE2EEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}
const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers as Record<string, string> ?? {}) } })

async function dbJson<T = Record<string, unknown>>(path: string, init: RequestInit = {}): Promise<T[]> {
  const r = await db(path, init)
  const body = await r.text()
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${body.slice(0, 300)}`)
  return body ? (JSON.parse(body) as T[]) : []
}

test.describe('VAR customer invoicing (Billing Option A/B)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!SUPABASE_URL || !SERVICE_KEY, 'Supabase service credentials required')

  let api: APIRequestContext
  let tenantId = ''
  let customerId = ''
  let adminId = ''
  let adminOriginalTenant: string | null = null
  const orderIds: string[] = []
  let invoiceId = ''

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120000)
    const page = await browser.newPage()
    await loginAs(page, 'admin')
    api = page.request

    const [me] = await dbJson<{ id: string; tenant_id: string | null }>('users?select=id,tenant_id&email=eq.admin@login.local')
    adminId = me.id
    adminOriginalTenant = me.tenant_id

    const [tenant] = await dbJson<{ id: string }>('tenants', {
      method: 'POST',
      body: JSON.stringify({ name: 'ZZ BILLING E2E', slug: `zz-billing-e2e-${Date.now()}`, type: 'var', settings: {} }),
    })
    tenantId = tenant.id
    await db(`users?id=eq.${adminId}`, { method: 'PATCH', body: JSON.stringify({ tenant_id: tenantId }) })

    const [customer] = await dbJson<{ id: string }>('customers', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenantId, company_name: 'ZZ Billing Customer', contact_name: 'Pat',
        contact_email: `pat+${Date.now()}@zz-billing.invalid`,
        billing_address: { state: 'ON', country: 'Canada' }, is_active: true,
      }),
    })
    customerId = customer.id

    for (const [suffix, amount] of [['A', 500], ['B', 250.5]] as const) {
      const [order] = await dbJson<{ id: string }>('orders', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId, customer_id: customerId, order_number: `ZZ-E2E-${Date.now()}-${suffix}`,
          type: 'trade_in', status: 'closed', created_by_id: adminId,
          total_quantity: 1, total_amount: amount, final_amount: amount,
        }),
      })
      orderIds.push(order.id)
    }
  })

  test.afterAll(async () => {
    if (adminId) await db(`users?id=eq.${adminId}`, { method: 'PATCH', body: JSON.stringify({ tenant_id: adminOriginalTenant }) })
    if (tenantId) {
      await db(`customer_invoice_payments?tenant_id=eq.${tenantId}`, { method: 'DELETE' })
      await db(`customer_invoice_line_items?tenant_id=eq.${tenantId}`, { method: 'DELETE' })
      await db(`customer_invoices?tenant_id=eq.${tenantId}`, { method: 'DELETE' })
      for (const id of orderIds) await db(`orders?id=eq.${id}`, { method: 'DELETE' })
      if (customerId) await db(`customers?id=eq.${customerId}`, { method: 'DELETE' })
      await db(`customer_invoice_counters?tenant_id=eq.${tenantId}`, { method: 'DELETE' })
      await db(`tenants?id=eq.${tenantId}`, { method: 'DELETE' })
    }
  })

  test('Option A (default): the API refuses with 409, not 403', async () => {
    const list = await api.get('/api/var/customer-invoices')
    expect(list.status(), await list.text()).toBe(409)
    expect((await list.json()).code).toBe('billing_mode_external')

    const create = await api.post('/api/var/customer-invoices', { data: { customer_id: customerId } })
    expect(create.status()).toBe(409)
  })

  test('switching to Option B turns the surface on', async () => {
    const res = await api.patch('/api/var/margins', { data: { billingMode: 'in_platform' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await res.json()).billingMode).toBe('in_platform')
  })

  test('creates an invoice from the closed orders, with the customer regional tax', async () => {
    const res = await api.post('/api/var/customer-invoices', { data: { customer_id: customerId, due_days: 30 } })
    expect(res.status(), await res.text()).toBe(201)
    const { data } = await res.json()
    invoiceId = data.id

    expect(data.lines).toHaveLength(2)
    expect(Number(data.subtotal)).toBe(750.5)
    expect(Number(data.tax_amount)).toBe(97.57) // 13% HST (ON)
    expect(Number(data.total)).toBe(848.07)
    expect(data.tax_label).toMatch(/HST \(ON\)/)
    expect(data.invoice_number).toMatch(/^INV-\d{4}-\d{4}$/)
  })

  test('the same orders cannot be billed twice', async () => {
    const res = await api.post('/api/var/customer-invoices', { data: { customer_id: customerId } })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/Nothing to invoice/i)
  })

  test('draft → sent', async () => {
    const res = await api.patch(`/api/var/customer-invoices/${invoiceId}`, { data: { action: 'send' } })
    expect(res.ok(), await res.text()).toBeTruthy()
    expect((await res.json()).data.status).toBe('sent')
  })

  test('a payment above the outstanding balance is refused', async () => {
    const res = await api.patch(`/api/var/customer-invoices/${invoiceId}`, { data: { action: 'record_payment', amount: 1000 } })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/exceeds the outstanding/i)
  })

  test('a refund with nothing paid is refused (the BB-billing bug)', async () => {
    const res = await api.patch(`/api/var/customer-invoices/${invoiceId}`, { data: { action: 'record_refund', amount: 10 } })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toMatch(/exceeds what has been paid/i)
  })

  test('part payment leaves the right balance and keeps the invoice sent', async () => {
    const res = await api.patch(`/api/var/customer-invoices/${invoiceId}`, { data: { action: 'record_payment', amount: 400 } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const { data } = await res.json()
    expect(data.balance.balance).toBe(448.07)
    expect(data.status).toBe('sent')
  })

  test('settling the balance marks the invoice paid', async () => {
    const res = await api.patch(`/api/var/customer-invoices/${invoiceId}`, { data: { action: 'record_payment', amount: 448.07 } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const { data } = await res.json()
    expect(data.balance.balance).toBe(0)
    expect(data.status).toBe('paid')
  })

  test('another tenant cannot read the invoice', async () => {
    await db(`users?id=eq.${adminId}`, { method: 'PATCH', body: JSON.stringify({ tenant_id: adminOriginalTenant }) })
    const res = await api.get(`/api/var/customer-invoices/${invoiceId}`)
    expect(res.status()).not.toBe(200)
    await db(`users?id=eq.${adminId}`, { method: 'PATCH', body: JSON.stringify({ tenant_id: tenantId }) })
  })
})
