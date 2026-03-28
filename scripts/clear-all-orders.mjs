#!/usr/bin/env node
/**
 * Clear all orders and related data from the database.
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Usage:
 *   node --env-file=.env.local scripts/clear-all-orders.mjs
 *   # Or: npm run clear-orders
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  console.error('Set them in .env.local or pass as env vars.');
  process.exit(1);
}

const supabase = createClient(URL, SERVICE_KEY);

async function clearAllOrders() {
  console.log('Fetching order IDs...');
  const { data: orders } = await supabase.from('orders').select('id');
  const orderIds = (orders || []).map((o) => o.id);
  if (orderIds.length === 0) {
    console.log('No orders found.');
  } else {
    console.log(`Found ${orderIds.length} orders. Clearing related data...`);
  }

  // Always clear notifications (many reference orders via metadata)
  const { data: notifs } = await supabase.from('notifications').select('id').limit(10000);
  const notifIds = (notifs || []).map((n) => n.id);
  if (notifIds.length > 0) {
    const { error: eNotif } = await supabase.from('notifications').delete().in('id', notifIds);
    if (eNotif) console.warn('notifications:', eNotif.message);
    else console.log(`  Cleared ${notifIds.length} notifications`);
  }

  if (orderIds.length === 0) {
    console.log('Done.');
    return;
  }

  // Delete in order of dependencies (child tables first)
  const { error: e1 } = await supabase.from('triage_results').delete().in('order_id', orderIds);
  if (e1) console.warn('triage_results:', e1.message);
  else console.log('  Cleared triage_results');

  const { error: e2 } = await supabase.from('imei_records').delete().in('order_id', orderIds);
  if (e2) console.warn('imei_records:', e2.message);
  else console.log('  Cleared imei_records');

  const { error: e3 } = await supabase.from('sla_breaches').delete().in('order_id', orderIds);
  if (e3) console.warn('sla_breaches:', e3.message);
  else console.log('  Cleared sla_breaches');

  const { error: e4 } = await supabase.from('vendor_bids').delete().in('order_id', orderIds);
  if (e4) console.warn('vendor_bids:', e4.message);
  else console.log('  Cleared vendor_bids');

  // order_splits references parent/sub orders
  const { error: es1 } = await supabase.from('order_splits').delete().in('parent_order_id', orderIds);
  const { error: es2 } = await supabase.from('order_splits').delete().in('sub_order_id', orderIds);
  if (es1 || es2) console.warn('order_splits:', es1?.message || es2?.message);
  else console.log('  Cleared order_splits');

  const { error: e5 } = await supabase.from('sales_history').delete().in('order_id', orderIds);
  if (e5) console.warn('sales_history:', e5.message);
  else console.log('  Cleared sales_history');

  const { error: eShip } = await supabase.from('shipments').delete().in('order_id', orderIds);
  if (eShip) console.warn('shipments:', eShip.message);
  else console.log('  Cleared shipments');

  const { error: eTimeline } = await supabase.from('order_timeline').delete().in('order_id', orderIds);
  if (eTimeline) console.warn('order_timeline:', eTimeline.message);
  else console.log('  Cleared order_timeline');

  // Delete orders (cascades to order_items)
  const { error: eOrders } = await supabase.from('orders').delete().in('id', orderIds);
  if (eOrders) {
    console.error('Failed to delete orders:', eOrders.message);
    process.exit(1);
  }
  console.log('  Cleared orders (and cascaded order_items, order_timeline, shipments)');
  console.log(`Done. Cleared ${orderIds.length} orders.`);
}

clearAllOrders().catch((err) => {
  console.error(err);
  process.exit(1);
});
