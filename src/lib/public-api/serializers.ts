// ============================================================================
// PUBLIC API v1 — response shapes
// ============================================================================
// Every shape here is an explicit whitelist. The SELECT column lists are the
// source of truth for what leaves the database, and these functions are the
// source of truth for what leaves the API — the two are kept adjacent so a
// column can't be added to one without being considered for the other.
//
// Deliberately NOT exposed: `internal_notes`, `pricing_metadata`, commission
// figures, vendor identities, `credit_limit`, `payment_terms`, `notes` on
// customers (free-text written by staff about the customer), fx internals.

export const ORDER_COLUMNS = [
  'id', 'order_number', 'type', 'status', 'customer_id',
  'total_quantity', 'total_amount', 'quoted_amount', 'final_amount', 'currency',
  'submitted_at', 'quoted_at', 'quote_expires_at', 'accepted_at', 'shipped_at',
  'received_at', 'completed_at', 'cancelled_at', 'is_sla_breached',
  'created_at', 'updated_at',
].join(', ')

export const ORDER_ITEM_COLUMNS = [
  'id', 'device_id', 'quantity', 'storage', 'colour', 'claimed_condition',
  'actual_condition', 'cpo_grade', 'quoted_price', 'final_price', 'imei',
  'serial_number', 'created_at', 'updated_at',
].join(', ')

export const DEVICE_CATALOG_COLUMNS = 'id, make, model, variant, category'

export const CUSTOMER_COLUMNS = [
  'id', 'company_name', 'contact_name', 'contact_email', 'contact_phone',
  'is_active', 'plan_id', 'created_at', 'updated_at',
].join(', ')

export const ASSET_COLUMNS = [
  'id', 'customer_id', 'device_id', 'label', 'serial_number', 'status',
  'assigned_to', 'location', 'created_at', 'updated_at',
].join(', ')

type Row = Record<string, unknown>

function pick(row: Row, keys: string[]): Row {
  const out: Row = {}
  for (const k of keys) out[k] = row[k] ?? null
  return out
}

const ORDER_KEYS = ORDER_COLUMNS.split(', ')
const ORDER_ITEM_KEYS = ORDER_ITEM_COLUMNS.split(', ')
const CUSTOMER_KEYS = CUSTOMER_COLUMNS.split(', ')
const ASSET_KEYS = ASSET_COLUMNS.split(', ')

export function serializeDevice(d: Row | null | undefined) {
  if (!d) return null
  return { id: d.id, make: d.make, model: d.model, variant: d.variant ?? null, category: d.category ?? null }
}

export function serializeOrder(row: Row) {
  return pick(row, ORDER_KEYS)
}

export function serializeOrderItem(row: Row) {
  const base = pick(row, ORDER_ITEM_KEYS)
  const device = row.device as Row | Row[] | null | undefined
  base.device = serializeDevice(Array.isArray(device) ? device[0] : device)
  return base
}

export function serializeOrderDetail(row: Row) {
  const items = Array.isArray(row.items) ? (row.items as Row[]) : []
  return { ...serializeOrder(row), items: items.map(serializeOrderItem) }
}

export function serializeCustomer(row: Row) {
  return pick(row, CUSTOMER_KEYS)
}

export function serializeAsset(row: Row) {
  const base = pick(row, ASSET_KEYS)
  const device = row.device as Row | Row[] | null | undefined
  base.device = serializeDevice(Array.isArray(device) ? device[0] : device)
  return base
}
