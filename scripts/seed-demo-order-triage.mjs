#!/usr/bin/env node
/**
 * Seed a demo order + triage + exception for UI demonstration.
 * Creates: 1 trade-in order, 1 order item, 1 IMEI record, 1 triage result (needs exception).
 *
 * Usage: node --env-file=.env.local scripts/seed-demo-order-triage.mjs
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('Seeding demo order + triage + exception...\n')

  // 1. Get required entities
  const { data: admin } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single()

  const { data: customer } = await supabase
    .from('customers')
    .select('id, company_name')
    .eq('is_active', true)
    .ilike('company_name', '%Acme%')
    .limit(1)
    .single()

  if (!customer?.id) {
    const { data: fallback } = await supabase
      .from('customers')
      .select('id, company_name')
      .eq('is_active', true)
      .limit(1)
      .single()
    if (fallback?.id) {
      customer = fallback
      console.log('  Note: Acme not found, using:', customer.company_name)
    }
  }

  const { data: device } = await supabase
    .from('device_catalog')
    .select('id, make, model')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!admin?.id || !customer?.id || !device?.id) {
    console.error('Missing: admin user, customer, or device. Run migrations and seed-test-users first.')
    process.exit(1)
  }

  const orderNumber = `ORD-DEMO-${Date.now().toString(36).toUpperCase().slice(-6)}`

  // 2. Create order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      type: 'trade_in',
      customer_id: customer.id,
      status: 'received',
      total_quantity: 1,
      total_amount: 450,
      quoted_amount: 500,
      created_by_id: admin.id,
      received_at: new Date().toISOString(),
    })
    .select('id, order_number')
    .single()

  if (orderErr) {
    console.error('Order insert error:', orderErr)
    process.exit(1)
  }
  console.log('  ✓ Order created:', order.order_number)

  // 3. Create order item
  const { data: orderItem, error: itemErr } = await supabase
    .from('order_items')
    .insert({
      order_id: order.id,
      device_id: device.id,
      quantity: 1,
      claimed_condition: 'excellent',
      unit_price: 450,
      quoted_price: 500,
    })
    .select('id')
    .single()

  if (itemErr) {
    console.error('Order item insert error:', itemErr)
    process.exit(1)
  }
  console.log('  ✓ Order item created')

  // 4. Create IMEI record (claimed excellent, will need exception after triage)
  const imei = `35${String(Math.floor(Math.random() * 1e13)).padStart(13, '0')}`
  const { data: imeiRecord, error: imeiErr } = await supabase
    .from('imei_records')
    .insert({
      imei,
      order_id: order.id,
      order_item_id: orderItem.id,
      device_id: device.id,
      claimed_condition: 'excellent',
      quoted_price: 500,
      triage_status: 'needs_exception',
    })
    .select('id, imei')
    .single()

  if (imeiErr) {
    console.error('IMEI insert error:', imeiErr)
    process.exit(1)
  }
  console.log('  ✓ IMEI record created:', imeiRecord.imei)

  // 5. Create triage result (condition downgraded: excellent -> good, needs approval)
  const { error: triageErr } = await supabase.from('triage_results').insert({
    imei_record_id: imeiRecord.id,
    order_id: order.id,
    physical_condition: 'good',
    functional_grade: 'good',
    cosmetic_grade: 'good',
    screen_condition: 'good',
    battery_health: 78,
    storage_verified: true,
    original_accessories: false,
    functional_tests: { display: true, touch: true, camera: true, speaker: true, battery: false },
    final_condition: 'good',
    condition_changed: true,
    price_adjustment: -50,
    exception_required: true,
    exception_reason: 'Customer claimed Excellent; inspection found Good. Battery health below 80%, minor wear.',
    triaged_by_id: admin.id,
    triaged_at: new Date().toISOString(),
  })

  if (triageErr) {
    console.error('Triage result insert error:', triageErr)
    process.exit(1)
  }
  console.log('  ✓ Triage result created (exception pending)')

  const { data: cust } = await supabase.from('customers').select('id, company_name').eq('id', customer.id).single()

  console.log('\nDone! View in the app:')
  console.log('  • Orders:      /orders')
  console.log('  • Order detail:', `/orders/${order.id}`)
  console.log('  • COE Triage: /coe/triage')
  console.log('  • Exceptions: /coe/exceptions')
  if (cust?.id) console.log('  • Acme customer: /customers/' + cust.id)
  console.log('\nAdmin: admin / Test123!')
  console.log('Customer view: acme / Test123! → Notifications, My Orders')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
