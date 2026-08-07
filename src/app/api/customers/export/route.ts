// ============================================================================
// CUSTOMERS EXPORT API - CSV download
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { CustomerService } from '@/services/customer.service'
import { customerScopeFilter } from '@/lib/delegation'
import type { Customer } from '@/types'

export const dynamic = 'force-dynamic'

function csvEscape(val: unknown): string {
  if (val == null) return ''
  const s = String(val)
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCSV(rows: Customer[]): string {
  const cols = ['Company Name', 'Contact Name', 'Email', 'Phone', 'Payment Terms', 'Status', 'Created']
  const header = cols.join(',')
  const body = rows.map((r) =>
    [
      csvEscape(r.company_name),
      csvEscape(r.contact_name),
      csvEscape(r.contact_email),
      csvEscape(r.contact_phone),
      csvEscape(r.payment_terms),
      r.is_active ? 'Active' : 'Inactive',
      csvEscape(r.created_at ? new Date(r.created_at).toISOString() : ''),
    ].join(',')
  )
  return [header, ...body].join('\r\n')
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { profile, effectiveRole } = auth

    // End customers / vendors can't export the customer book; everyone else can,
    // narrowed by tenant RLS + delegated scope (region / own) below.
    if (['customer', 'vendor'].includes(effectiveRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || undefined
    const scope = customerScopeFilter({ role: profile.role, userId: profile.id, region: profile.region })

    const result = await CustomerService.getCustomers({
      page: 1,
      page_size: 10000,
      search,
      scope,
    })

    const csv = toCSV(result.data)
    const timestamp = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="customers-${timestamp}.csv"`,
      },
    })
  } catch (error) {
    console.error('Error exporting customers:', error)
    return NextResponse.json(
      { error: 'Failed to export customers' },
      { status: 500 }
    )
  }
}
