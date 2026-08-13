#!/usr/bin/env node
/**
 * READ-ONLY data audit — lists users, customers, vendors, orders, and shipments
 * so a human can decide what is test data. Performs NO writes/deletes.
 *
 * Usage: node --env-file=.env.local scripts/audit-data.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local).')
  process.exit(1)
}
const supabase = createClient(URL, SERVICE_KEY)

// Heuristics that *suggest* a row is test data (for a ⚑ hint only — never authoritative).
const TEST_EMAIL = /@(example|test|demo|zeta|acme|mailinator)\.|(\+test)|test@|demo@/i
const TEST_NAME = /\b(test|demo|sample|dummy|qa|foo|bar|zeta|acme|mattyd)\b/i
const flag = (s) => (s && (TEST_EMAIL.test(s) || TEST_NAME.test(s)) ? ' ⚑' : '')

async function main() {
  console.log(`\nDATA AUDIT — ${URL}\n${'='.repeat(70)}`)

  // Users
  const { data: users } = await supabase
    .from('users')
    .select('id, email, full_name, role, is_active, created_at')
    .order('created_at', { ascending: true })
  console.log(`\nUSERS (${users?.length ?? 0})`)
  for (const u of users || []) {
    console.log(`  [${u.role}] ${u.full_name || '—'} <${u.email || '—'}> active=${u.is_active} ${u.created_at?.slice(0, 10)}${flag(u.email) || flag(u.full_name)}`)
  }

  // Customers
  const { data: customers } = await supabase
    .from('customers')
    .select('id, company_name, contact_name, contact_email, is_active, created_at')
    .order('created_at', { ascending: true })
  console.log(`\nCUSTOMERS (${customers?.length ?? 0})`)
  for (const c of customers || []) {
    console.log(`  ${c.company_name || '—'} — ${c.contact_name || '—'} <${c.contact_email || '—'}> ${c.created_at?.slice(0, 10)}${flag(c.contact_email) || flag(c.company_name)}`)
  }

  // Vendors
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, company_name, contact_email, created_at')
    .order('created_at', { ascending: true })
  console.log(`\nVENDORS (${vendors?.length ?? 0})`)
  for (const v of vendors || []) {
    console.log(`  ${v.company_name || '—'} <${v.contact_email || '—'}> ${v.created_at?.slice(0, 10)}${flag(v.contact_email) || flag(v.company_name)}`)
  }

  // Orders (list, newest first)
  const { data: orders } = await supabase
    .from('orders')
    .select('order_number, type, status, total_quantity, created_at, customer:customers(company_name)')
    .order('created_at', { ascending: false })
    .limit(500)
  console.log(`\nORDERS (${orders?.length ?? 0}${orders?.length === 500 ? '+, showing 500' : ''})`)
  for (const o of orders || []) {
    const co = Array.isArray(o.customer) ? o.customer[0] : o.customer
    console.log(`  ${o.order_number} [${o.type}/${o.status}] qty=${o.total_quantity ?? '—'} ${co?.company_name || '—'} ${o.created_at?.slice(0, 10)}${flag(co?.company_name)}`)
  }

  // Shipments
  const { data: shipments } = await supabase
    .from('shipments')
    .select('tracking_number, carrier, status, direction, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  console.log(`\nSHIPMENTS (${shipments?.length ?? 0})`)
  for (const s of shipments || []) {
    console.log(`  ${s.tracking_number} [${s.carrier}/${s.status}/${s.direction}] ${s.created_at?.slice(0, 10)}`)
  }

  console.log(`\n${'='.repeat(70)}\n⚑ = matches a test-data heuristic (name/email). Review — NOT authoritative.\nNothing was modified. This script only reads.\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
