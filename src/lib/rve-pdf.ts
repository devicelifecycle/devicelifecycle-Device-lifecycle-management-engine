// ============================================================================
// RESIDUAL VALUE QUOTE PDF
// ============================================================================
// A customer-facing residual-value quote. Mirrors the trade-in quote layout
// (device lines → per-line value → total) but each line's value is projected
// from the depreciation table at the chosen horizon. Built with jsPDF so it can
// be emailed as an attachment, like the order quote PDF.

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { residualSchedule } from './rve'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Byte-Back'

export interface RveQuoteLine {
  label: string
  baseValue: number
  residualValue: number
}

export interface RveQuotePDFData {
  quoteNumber: string
  customerName: string
  horizonYears: number
  lines: RveQuoteLine[]
  total: number
  createdAt: string
}

function money(n: number): string {
  return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} CAD`
}

export function generateRveQuotePDF(data: RveQuotePDFData, brandName?: string): Buffer {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(brandName || APP_NAME, 14, 20)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'normal')
  doc.text('Residual Value Quote', 14, 28)

  doc.setFontSize(10)
  doc.text(`Quote: ${data.quoteNumber}`, pageWidth - 14, 20, { align: 'right' })
  doc.text(`Date: ${new Date(data.createdAt).toLocaleDateString('en-CA')}`, pageWidth - 14, 26, { align: 'right' })

  doc.text(`Prepared for: ${data.customerName}`, 14, 40)
  doc.text(`Projection horizon: ${data.horizonYears} year${data.horizonYears > 1 ? 's' : ''}`, 14, 46)

  autoTable(doc, {
    startY: 54,
    head: [['Device', 'Current value', `Residual @ ${data.horizonYears}y`]],
    body: data.lines.map((l) => [l.label || '—', money(l.baseValue), money(l.residualValue)]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
  })

  const afterTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 70
  let y = afterTable + 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(`Total residual value @ ${data.horizonYears}y:`, 14, y)
  doc.text(money(data.total), pageWidth - 14, y, { align: 'right' })

  // Year-by-year schedule for the first line, so the customer sees the curve.
  const first = data.lines.find((l) => l.baseValue > 0)
  if (first) {
    y += 12
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Depreciation schedule — ${first.label || 'first device'}`, 14, y)
    autoTable(doc, {
      startY: y + 4,
      head: [['Year', 'Retained', 'Value']],
      body: residualSchedule(first.baseValue, data.horizonYears).map((r) => [
        r.year === 0 ? 'Now' : `Year ${r.year}`,
        `${Math.round(r.retention * 100)}%`,
        money(r.value),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [100, 116, 139] },
    })
  }

  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(
    'This residual value is an estimate projected from our depreciation table and is not a binding offer.',
    14,
    doc.internal.pageSize.getHeight() - 12,
  )

  return Buffer.from(doc.output('arraybuffer'))
}
