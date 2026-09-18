// GET /api/v1/customers — list the tenant's customers.
//   ?q=<text>  (company / contact name / email, case-insensitive)
//   ?is_active=true|false   ?limit=   ?offset=
import { NextRequest } from 'next/server'
import { authorizeV1, apiError, parsePage, tenantQuery, listResponse, asRows } from '@/lib/public-api'
import { CUSTOMER_COLUMNS, serializeCustomer } from '@/lib/public-api/serializers'
import { sanitizeSearchInput } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await authorizeV1(req, 'read')
  if ('error' in auth) return auth.error
  const { ctx } = auth

  const sp = req.nextUrl.searchParams
  const isActiveRaw = sp.get('is_active')
  if (isActiveRaw !== null && isActiveRaw !== 'true' && isActiveRaw !== 'false') {
    return apiError(400, 'is_active must be true or false.', 'invalid_filter')
  }
  const q = sanitizeSearchInput(sp.get('q')?.trim() ?? '')

  const page = parsePage(req)
  let query = tenantQuery(ctx, 'customers', CUSTOMER_COLUMNS, { count: 'exact' })
  if (isActiveRaw !== null) query = query.eq('is_active', isActiveRaw === 'true')
  if (q) query = query.or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%,contact_email.ilike.%${q}%`)

  const { data, error, count } = await query
    .order('company_name', { ascending: true })
    .range(page.offset, page.offset + page.limit - 1)

  if (error) {
    console.error('v1/customers list failed', error)
    return apiError(500, 'Could not load customers.', 'internal')
  }
  return listResponse(asRows(data).map(serializeCustomer), page, count)
}
