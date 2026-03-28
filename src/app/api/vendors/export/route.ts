// ============================================================================
// VENDORS EXPORT API - CSV download
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VendorService } from '@/services/vendor.service'
import type { Vendor } from '@/types'

export const dynamic = 'force-dynamic'

function csvEscape(val: unknown): string {
  if (val == null) return ''
  const s = String(val)
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCSV(rows: Vendor[]): string {
  const cols = ['Company Name', 'Contact Name', 'Email', 'Phone', 'Rating', 'Warranty (days)', 'Status', 'Created']
  const header = cols.join(',')
  const body = rows.map((r) =>
    [
      csvEscape(r.company_name),
      csvEscape(r.contact_name),
      csvEscape(r.contact_email),
      csvEscape(r.contact_phone),
      csvEscape(r.rating),
      csvEscape(r.warranty_period_days),
      r.is_active ? 'Active' : 'Inactive',
      csvEscape(r.created_at ? new Date(r.created_at).toISOString() : ''),
    ].join(',')
  )
  return [header, ...body].join('\r\n')
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || undefined
    const isActiveParam = searchParams.get('is_active')
    const is_active = isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined

    const result = await VendorService.getVendors({
      page: 1,
      page_size: 10000,
      search,
      is_active,
    })

    const csv = toCSV(result.data)
    const timestamp = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vendors-${timestamp}.csv"`,
      },
    })
  } catch (error) {
    console.error('Error exporting vendors:', error)
    return NextResponse.json(
      { error: 'Failed to export vendors' },
      { status: 500 }
    )
  }
}
