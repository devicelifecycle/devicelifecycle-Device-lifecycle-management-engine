// ============================================================================
// VAR BILLING INVOICE PDF — download a single BB→VAR invoice as PDF
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { featureGate } from '@/lib/supabase/require-feature'
import { resolveBranding } from '@/lib/branding'
import { isValidUUID } from '@/lib/utils'

export const dynamic = 'force-dynamic'

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Toronto',
  })
}

function fmtMoney(amount: number, currency = 'CAD'): string {
  const num = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
  return `$${num} ${currency.toUpperCase()}`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!auth.tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 })

  const gated = await featureGate(auth.tenantId, 'billing', 'Billing')
  if (gated) return gated

  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid invoice id' }, { status: 400 })

  const supabase = createServiceRoleClient()

  const [invoiceRes, tenantRes] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle(),
    supabase.from('tenants').select('name, branding').eq('id', auth.tenantId).maybeSingle(),
  ])

  if (invoiceRes.error || !invoiceRes.data) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const invoice = invoiceRes.data
  const branding = resolveBranding(tenantRes.data?.branding)
  const tenantName = tenantRes.data?.name ?? branding.name

  const { data: payments } = await supabase
    .from('invoice_payments')
    .select('id, amount, type, note, created_at')
    .eq('invoice_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  // Header
  doc.setFillColor(24, 24, 27)
  doc.rect(0, 0, pageWidth, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Byte-Back', 14, 22)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('INVOICE', pageWidth - 14, 22, { align: 'right' })

  y = 48

  // Invoice metadata
  doc.setTextColor(113, 113, 122)
  doc.setFontSize(9)
  doc.text('INVOICE #', 14, y)
  doc.text('DATE', 80, y)
  doc.text('STATUS', 130, y)
  doc.text('PERIOD', 165, y)
  y += 6
  doc.setTextColor(24, 24, 27)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(String(invoice.invoice_number ?? '—'), 14, y)
  doc.setFont('helvetica', 'normal')
  doc.text(fmtDate(invoice.created_at), 80, y)
  doc.text(String(invoice.status).toUpperCase(), 130, y)
  doc.setFontSize(9)
  doc.text(
    `${fmtDate(invoice.period_start)} – ${fmtDate(invoice.period_end)}`,
    165, y,
  )
  y += 12

  // Bill To
  doc.setFillColor(244, 244, 245)
  doc.rect(14, y - 4, pageWidth - 28, 20, 'F')
  doc.setTextColor(113, 113, 122)
  doc.setFontSize(9)
  doc.text('BILL TO', 20, y + 2)
  y += 8
  doc.setTextColor(24, 24, 27)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(tenantName, 20, y)
  doc.setFont('helvetica', 'normal')
  y += 16

  // Line items from invoice_line_items (if they exist)
  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('description, gross_amount, commission_amount')
    .eq('invoice_id', id)
    .limit(500)

  const currency = (invoice.currency as string) ?? 'CAD'

  if (lineItems && lineItems.length > 0) {
    const tableBody = lineItems.map((li) => [
      String(li.description ?? ''),
      fmtMoney(Number(li.gross_amount ?? 0), currency),
      fmtMoney(Number(li.commission_amount ?? 0), currency),
    ])

    autoTable(doc, {
      startY: y,
      head: [['Description', 'Gross Amount', 'Platform Fee']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9, textColor: [63, 63, 70] },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { halign: 'right', cellWidth: 35 },
        2: { halign: 'right', cellWidth: 35 },
      },
      margin: { left: 14, right: 14 },
    })
    // @ts-expect-error autoTable adds lastAutoTable to doc
    y = doc.lastAutoTable.finalY + 10
  }

  // Totals
  const totalsX = pageWidth - 80
  doc.setDrawColor(228, 228, 231)
  doc.line(totalsX, y, pageWidth - 14, y)
  y += 7
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(24, 24, 27)
  doc.text('Total:', totalsX, y)
  doc.text(fmtMoney(Number(invoice.total ?? 0), currency), pageWidth - 14, y, { align: 'right' })
  y += 10

  // Payments
  if (payments && payments.length > 0) {
    y += 4
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(24, 24, 27)
    doc.text('Payments', 14, y)
    y += 6

    const payBody = payments.map((p) => [
      fmtDate(p.created_at),
      String(p.type ?? 'payment'),
      fmtMoney(Number(p.amount ?? 0), currency),
      String(p.note ?? ''),
    ])

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Type', 'Amount', 'Note']],
      body: payBody,
      theme: 'grid',
      headStyles: { fillColor: [63, 63, 70], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [63, 63, 70] },
      margin: { left: 14, right: 14 },
    })
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setDrawColor(228, 228, 231)
  doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(161, 161, 170)
  doc.text(
    `Generated by Byte-Back on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Toronto', year: 'numeric', month: 'short', day: 'numeric' })}`,
    14, pageHeight - 12,
  )
  doc.text('Thank you for your business.', pageWidth - 14, pageHeight - 12, { align: 'right' })

  const buffer = Buffer.from(doc.output('arraybuffer'))
  const filename = `invoice-${invoice.invoice_number ?? id}.pdf`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  })
}
