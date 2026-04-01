#!/usr/bin/env node
/**
 * Wipe live workflow data while preserving the device/pricing catalog.
 *
 * This clears:
 * - auth users and app user profiles
 * - organizations, customers, vendors
 * - orders and all operational dependents
 * - notifications and audit logs
 *
 * This preserves:
 * - device catalog
 * - pricing tables / market / competitor / repair data
 * - pricing settings / trained pricing tables
 * - SLA rules
 *
 * Usage:
 *   node --env-file=.env.local scripts/wipe-workflow-data.mjs
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PAGE_SIZE = 500

if (!URL || !SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function fetchIds(table, idColumn = 'id') {
  const ids = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(idColumn)
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`${table}: failed to fetch IDs - ${error.message}`)
    }

    const batch = (data || []).map((row) => row[idColumn]).filter(Boolean)
    ids.push(...batch)

    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return ids
}

async function deleteByIds(table, ids, idColumn = 'id') {
  if (!ids.length) {
    console.log(`  ${table}: already empty`)
    return 0
  }

  let deleted = 0
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100)
    const { error } = await supabase.from(table).delete().in(idColumn, batch)
    if (error) {
      throw new Error(`${table}: delete failed - ${error.message}`)
    }
    deleted += batch.length
  }

  console.log(`  ${table}: deleted ${deleted}`)
  return deleted
}

async function wipeTable(table, idColumn = 'id') {
  const ids = await fetchIds(table, idColumn)
  return deleteByIds(table, ids, idColumn)
}

async function listAllAuthUsers() {
  const users = []
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    })

    if (error) {
      throw new Error(`auth.users: failed to list users - ${error.message}`)
    }

    const batch = data?.users || []
    users.push(...batch)

    if (batch.length < PAGE_SIZE) break
    page += 1
  }

  return users
}

async function wipeAuthUsers() {
  const users = await listAllAuthUsers()
  if (!users.length) {
    console.log('  auth.users: already empty')
    return 0
  }

  for (const user of users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) {
      throw new Error(`auth.users: failed to delete ${user.email || user.id} - ${error.message}`)
    }
  }

  console.log(`  auth.users: deleted ${users.length}`)
  return users.length
}

async function main() {
  console.log('Wiping workflow data while preserving pricing/catalog tables...\n')

  // Order / notification / audit dependents first.
  await wipeTable('notifications')
  await wipeTable('audit_logs')
  await wipeTable('triage_results')
  await wipeTable('imei_records')
  await wipeTable('sla_breaches')
  await wipeTable('shipments')
  await wipeTable('vendor_bids')
  await wipeTable('order_splits')
  await wipeTable('sales_history')
  await wipeTable('order_timeline')
  await wipeTable('orders')

  // Remove app users before organizations so FK constraints do not block deletes.
  await wipeTable('users')
  await wipeAuthUsers()

  // Remove org-linked business records and organizations.
  await wipeTable('customers')
  await wipeTable('vendors')
  await wipeTable('organizations')

  console.log('\nWorkflow data wipe complete.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
