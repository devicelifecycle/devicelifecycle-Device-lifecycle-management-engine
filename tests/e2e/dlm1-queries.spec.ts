import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

/**
 * DLM 1.0 endpoints whose database query named columns that do not exist.
 *
 * PostgREST rejects the whole request when a select names a missing column, so
 * each of these answered an error 100% of the time — for months, silently,
 * because nothing exercised them. A full-codebase audit of every `.select()`
 * against the live schema (2026-09-28) found them.
 *
 * These assertions are deliberately about the SHAPE of a successful response
 * rather than specific data, so they keep working as the database changes but
 * fail immediately if a select breaks again.
 */

test.describe('DLM 1.0 endpoints with previously-broken queries', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120000)

  test('reconciliation report loads (triage_results join through imei_records)', async ({ browser }) => {
    const page = await browser.newPage()
    await loginAs(page, 'admin')

    const res = await page.request.get('/api/reports/reconciliation?days=365')
    expect(res.status(), await res.text()).toBe(200)

    const body = await res.json()
    // Previously: 500 "Failed to load reconciliation data" on every call.
    expect(body).not.toHaveProperty('error')
    expect(Array.isArray(body.items)).toBeTruthy()

    // If the environment has triage data, the fields that used to be selected
    // from non-existent columns must now be populated from the real ones.
    if (body.items.length > 0) {
      const row = body.items[0]
      for (const key of ['order_number', 'device', 'claimed_condition', 'actual_condition', 'condition_changed']) {
        expect(row, `reconciliation row is missing ${key}`).toHaveProperty(key)
      }
      // A row can only be "changed" when both sides are known.
      for (const r of body.items) {
        if (r.claimed_condition === '—' || r.actual_condition === '—') {
          expect(r.condition_changed, 'unknown condition must not count as a change').toBe(false)
        }
      }
    }
    await page.close()
  })

  test('AI assistant can look up an order (orders.notes, not customer_notes)', async ({ browser }) => {
    const page = await browser.newPage()
    await loginAs(page, 'admin')

    // Find any real order to ask about.
    const list = await page.request.get('/api/orders?limit=1')
    expect(list.ok(), await list.text()).toBeTruthy()
    const orders = (await list.json()).data ?? []
    test.skip(orders.length === 0, 'no orders in this environment')

    const res = await page.request.post('/api/chat', {
      data: { messages: [{ role: 'user', content: `Show me the details of order ${orders[0].order_number}` }] },
    })
    expect(res.status(), await res.text()).toBe(200)
    const body = await res.json()
    // Previously the tool always returned "Order not found." because the
    // select named orders.customer_notes.
    expect(String(body.content ?? '')).not.toMatch(/order not found/i)
    await page.close()
  })
})
