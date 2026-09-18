// GET /api/v1/customers/{id} — one customer. Wrong-tenant ids 404.
import { NextRequest } from 'next/server'
import { authorizeV1, apiError, requireUuid, tenantQuery, itemResponse, asRow } from '@/lib/public-api'
import { CUSTOMER_COLUMNS, serializeCustomer } from '@/lib/public-api/serializers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeV1(req, 'read')
  if ('error' in auth) return auth.error
  const { ctx } = auth

  const { id } = await params
  const bad = requireUuid(id)
  if (bad) return bad

  const { data, error } = await tenantQuery(ctx, 'customers', CUSTOMER_COLUMNS).eq('id', id).maybeSingle()
  if (error) {
    console.error('v1/customers detail failed', error)
    return apiError(500, 'Could not load customer.', 'internal')
  }
  const row = asRow(data)
  if (!row) return apiError(404, 'Customer not found.', 'not_found')
  return itemResponse(serializeCustomer(row))
}
