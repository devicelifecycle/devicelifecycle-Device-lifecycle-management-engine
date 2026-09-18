// GET /api/v1/orders/{id} — one order with its line items and device details.
// A wrong-tenant id 404s exactly like a nonexistent one; existence is not leaked.
import { NextRequest } from 'next/server'
import { authorizeV1, apiError, requireUuid, tenantQuery, itemResponse, asRow } from '@/lib/public-api'
import {
  ORDER_COLUMNS, ORDER_ITEM_COLUMNS, DEVICE_CATALOG_COLUMNS, serializeOrderDetail,
} from '@/lib/public-api/serializers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeV1(req, 'read')
  if ('error' in auth) return auth.error
  const { ctx } = auth

  const { id } = await params
  const bad = requireUuid(id)
  if (bad) return bad

  const columns = `${ORDER_COLUMNS}, items:order_items(${ORDER_ITEM_COLUMNS}, device:device_catalog(${DEVICE_CATALOG_COLUMNS}))`
  const { data, error } = await tenantQuery(ctx, 'orders', columns).eq('id', id).maybeSingle()

  if (error) {
    console.error('v1/orders detail failed', error)
    return apiError(500, 'Could not load order.', 'internal')
  }
  const row = asRow(data)
  if (!row) return apiError(404, 'Order not found.', 'not_found')
  return itemResponse(serializeOrderDetail(row))
}
