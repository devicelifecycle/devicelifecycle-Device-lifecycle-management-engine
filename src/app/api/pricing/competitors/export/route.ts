// ============================================================================
// COMPETITOR PRICE EXPORT API ROUTE
// Supports PDF and Excel exports for competitor tracking data
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'

export const dynamic = 'force-dynamic'

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const format = (request.nextUrl.searchParams.get('format') || 'excel').toLowerCase()
    const conditionParam = request.nextUrl.searchParams.get('condition')
    const condition = conditionParam === 'excellent' || conditionParam === 'good' || conditionParam === 'fair' || conditionParam === 'broken'
      ? conditionParam
      : undefined
    const search = (request.nextUrl.searchParams.get('search') || '').toLowerCase().trim()

    const allData = await PricingService.getCompetitorPrices(undefined, condition)
    const filtered = allData.filter((row) => {
      if (!search) return true
      const deviceName = row.device ? `${row.device.make} ${row.device.model}`.toLowerCase() : ''
      return (
        deviceName.includes(search) ||
        row.storage.toLowerCase().includes(search) ||
        row.competitor_name.toLowerCase().includes(search) ||
        (row.condition || 'good').toLowerCase().includes(search)
      )
    })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape' })
      doc.setFontSize(14)
      doc.text('Competitor Price Tracking', 14, 16)
      doc.setFontSize(9)
      doc.text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' })}`, 14, 22)

      autoTable(doc, {
        startY: 28,
        head: [['Device', 'Storage', 'Condition', 'Competitor', 'Trade-In', 'Sell', 'Source', 'Retrieved At', 'Updated']],
        body: filtered.map((row) => [
          row.device ? `${row.device.make} ${row.device.model}` : row.device_id,
          row.storage,
          row.condition || 'good',
          row.competitor_name,
          row.trade_in_price != null ? row.trade_in_price.toFixed(2) : '—',
          row.sell_price != null ? row.sell_price.toFixed(2) : '—',
          row.source,
          (row.retrieved_at || row.scraped_at || row.updated_at || row.created_at)
            ? new Date(row.retrieved_at || row.scraped_at || row.updated_at || row.created_at as string).toLocaleString('en-US', { timeZone: 'America/Toronto' })
            : '—',
          row.updated_at ? new Date(row.updated_at).toLocaleDateString('en-US', { timeZone: 'America/Toronto' }) : '—',
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [24, 24, 27] },
      })

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="competitor-prices-${timestamp}.pdf"`,
        },
      })
    }

    const rowsHtml = filtered.map((row) => {
      const deviceName = row.device ? `${row.device.make} ${row.device.model}` : row.device_id
      const retrievedAtRaw = row.retrieved_at || row.scraped_at || row.updated_at || row.created_at
      const retrievedAt = retrievedAtRaw ? new Date(retrievedAtRaw).toLocaleString('en-US', { timeZone: 'America/Toronto' }) : '—'
      const updated = row.updated_at ? new Date(row.updated_at).toLocaleString('en-US', { timeZone: 'America/Toronto' }) : '—'
      return `<tr>
        <td>${escapeHtml(deviceName)}</td>
        <td>${escapeHtml(row.storage)}</td>
        <td>${escapeHtml(row.condition || 'good')}</td>
        <td>${escapeHtml(row.competitor_name)}</td>
        <td>${row.trade_in_price != null ? row.trade_in_price.toFixed(2) : '—'}</td>
        <td>${row.sell_price != null ? row.sell_price.toFixed(2) : '—'}</td>
        <td>${escapeHtml(row.source)}</td>
        <td>${escapeHtml(retrievedAt)}</td>
        <td>${escapeHtml(updated)}</td>
      </tr>`
    }).join('')

    const excelHtml = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <h3>Competitor Price Tracking</h3>
          <table border="1">
            <thead>
              <tr>
                <th>Device</th>
                <th>Storage</th>
                <th>Condition</th>
                <th>Competitor</th>
                <th>Trade-In</th>
                <th>Sell</th>
                <th>Source</th>
                <th>Retrieved At</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `

    return new NextResponse(excelHtml, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
        'Content-Disposition': `attachment; filename="competitor-prices-${timestamp}.xls"`,
      },
    })
  } catch (error) {
    console.error('Error exporting competitor prices:', error)
    return NextResponse.json({ error: 'Failed to export competitor prices' }, { status: 500 })
  }
}
