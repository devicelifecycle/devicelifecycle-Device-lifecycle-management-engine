// GET /api/v1/orders — list the tenant's orders.
//   ?status=<OrderStatus>   ?type=trade_in|cpo   ?customer_id=<uuid>
//   ?updated_since=<ISO>    ?limit= (≤200, default 50)   ?offset=
// Sorted newest-first by created_at. Read-only.
import { NextRequest } from 'next/server'
import { authorizeV1, apiError, parsePage, parseIsoParam, tenantQuery, listResponse, asRows } from '@/lib/public-api'
import { ORDER_COLUMNS, serializeOrder } from '@/lib/public-api/serializers'
import { isValidUUID } from '@/lib/utils'
import { ORDER_STATUS_CONFIG } from '@/lib/constants'

export const dynamic = 'force-dynamic'

const ORDER_TYPES = ['trade_in', 'cpo'] as const
const ORDER_STATUSES = Object.keys(ORDER_STATUS_CONFIG)

export async function GET(req: NextRequest) {
  const auth = await authorizeV1(req, 'read')
  if ('error' in auth) return auth.error
  const { ctx } = auth

  const sp = req.nextUrl.searchParams
  const status = sp.get('status')
  const type = sp.get('type')
  const customerId = sp.get('customer_id')
  const updatedSince = parseIsoParam(req, 'updated_since')

  if (status && !ORDER_STATUSES.includes(status)) {
    return apiError(400, `Unknown status "${status}".`, 'invalid_filter')
  }
  if (type && !(ORDER_TYPES as readonly string[]).includes(type)) {
    return apiError(400, `Unknown type "${type}". Expected trade_in or cpo.`, 'invalid_filter')
  }
  if (customerId && !isValidUUID(customerId)) {
    return apiError(400, 'customer_id must be a UUID.', 'invalid_filter')
  }
  if (updatedSince === null) {
    return apiError(400, 'updated_since must be an ISO-8601 timestamp.', 'invalid_filter')
  }

  const page = parsePage(req)
  let q = tenantQuery(ctx, 'orders', ORDER_COLUMNS, { count: 'exact' })
  if (status) q = q.eq('status', status)
  if (type) q = q.eq('type', type)
  if (customerId) q = q.eq('customer_id', customerId)
  if (updatedSince) q = q.gte('updated_at', updatedSince)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(page.offset, page.offset + page.limit - 1)

  if (error) {
    console.error('v1/orders list failed', error)
    return apiError(500, 'Could not load orders.', 'internal')
  }
  return listResponse(asRows(data).map(serializeOrder), page, count)
}
