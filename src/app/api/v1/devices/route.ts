// GET /api/v1/devices — the tenant's registered customer assets (device register).
//   ?customer_id=<uuid>   ?status=registered|assigned|retired   ?limit=   ?offset=
import { NextRequest } from 'next/server'
import { authorizeV1, apiError, parsePage, tenantQuery, listResponse, asRows } from '@/lib/public-api'
import { ASSET_COLUMNS, DEVICE_CATALOG_COLUMNS, serializeAsset } from '@/lib/public-api/serializers'
import { isValidUUID } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const ASSET_STATUSES = ['registered', 'assigned', 'retired'] as const

export async function GET(req: NextRequest) {
  const auth = await authorizeV1(req, 'read')
  if ('error' in auth) return auth.error
  const { ctx } = auth

  const sp = req.nextUrl.searchParams
  const customerId = sp.get('customer_id')
  const status = sp.get('status')
  if (customerId && !isValidUUID(customerId)) {
    return apiError(400, 'customer_id must be a UUID.', 'invalid_filter')
  }
  if (status && !(ASSET_STATUSES as readonly string[]).includes(status)) {
    return apiError(400, `Unknown status "${status}". Expected registered, assigned or retired.`, 'invalid_filter')
  }

  const page = parsePage(req)
  let q = tenantQuery(
    ctx,
    'customer_assets',
    `${ASSET_COLUMNS}, device:device_catalog(${DEVICE_CATALOG_COLUMNS})`,
    { count: 'exact' },
  )
  if (customerId) q = q.eq('customer_id', customerId)
  if (status) q = q.eq('status', status)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(page.offset, page.offset + page.limit - 1)

  if (error) {
    console.error('v1/devices list failed', error)
    return apiError(500, 'Could not load devices.', 'internal')
  }
  return listResponse(asRows(data).map(serializeAsset), page, count)
}
