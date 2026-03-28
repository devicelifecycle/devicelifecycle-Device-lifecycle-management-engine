// ============================================================================
// PDF GENERATION UTILITY (jsPDF + autoTable)
// ============================================================================

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'DLM Engine'

interface OrderPDFData {
  order_number: string
  type: string
  status: string
  created_at: string
  submitted_at?: string
  quoted_at?: string
  total_quantity?: number
  total_amount?: number
  quoted_amount?: number
  final_amount?: number
  customer_notes?: string
  customer?: {
    company_name?: string
    contact_name?: string
    contact_email?: string
    contact_phone?: string
    billing_address?: string | Record<string, unknown>
    shipping_address?: string | Record<string, unknown>
  }
  items?: {
    device?: { make?: string; model?: string; variant?: string }
    quantity: number
    storage?: string
    claimed_condition?: string
    unit_price?: number
    guaranteed_buyback_price?: number
    buyback_condition?: string
    buyback_valid_until?: string
  }[]
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/New_York',
  })
}

export function generateOrderPDF(order: OrderPDFData): Buffer {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  // --- Header ---
  doc.setFillColor(24, 24, 27) // zinc-900
  doc.rect(0, 0, pageWidth, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(APP_NAME, 14, 22)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  const isQuote = ['submitted', 'quoted'].includes(order.status)
  const docType = isQuote ? 'QUOTE' : 'INVOICE'
  doc.text(docType, pageWidth - 14, 22, { align: 'right' })

  y = 48

  // --- Document Info ---
  doc.setTextColor(113, 113, 122) // zinc-500
  doc.setFontSize(9)
  doc.text('DOCUMENT', 14, y)
  doc.text('DATE', 100, y)
  doc.text('STATUS', 155, y)
  y += 6
  doc.setTextColor(24, 24, 27)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`#${order.order_number}`, 14, y)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(order.quoted_at || order.submitted_at || order.created_at), 100, y)
  const statusLabel = order.status.replace(/_/g, ' ').toUpperCase()
  doc.text(statusLabel, 155, y)
  y += 4

  // --- Type badge ---
  y += 4
  doc.setFontSize(9)
  doc.setTextColor(113, 113, 122)
  doc.text(`Type: ${order.type === 'trade_in' ? 'Trade-In' : 'CPO'}`, 14, y)
  y += 12

  // --- Customer Info ---
  if (order.customer) {
    doc.setFillColor(244, 244, 245) // zinc-100
    doc.rect(14, y - 4, pageWidth - 28, 34, 'F')

    doc.setTextColor(113, 113, 122)
    doc.setFontSize(9)
    doc.text('BILL TO', 20, y + 2)
    y += 8
    doc.setTextColor(24, 24, 27)
    doc.setFontSize(10)
    if (order.customer.company_name) {
      doc.setFont('helvetica', 'bold')
      doc.text(order.customer.company_name, 20, y)
      doc.setFont('helvetica', 'normal')
      y += 5
    }
    if (order.customer.contact_name) {
      doc.text(order.customer.contact_name, 20, y)
      y += 5
    }
    if (order.customer.contact_email) {
      doc.setTextColor(113, 113, 122)
      doc.text(order.customer.contact_email, 20, y)
    }
    y += 18
  }

  // --- Line Items Table ---
  const tableBody = (order.items || []).map(item => {
    const deviceName = item.device
      ? `${item.device.make || ''} ${item.device.model || ''}${item.device.variant ? ` (${item.device.variant})` : ''}`
      : 'Unknown Device'
    const device = item.storage ? `${deviceName} — ${item.storage}` : deviceName
    const condition = item.claimed_condition
      ? item.claimed_condition.charAt(0).toUpperCase() + item.claimed_condition.slice(1)
      : '—'
    const unitPrice = item.unit_price ? formatCurrency(item.unit_price) : '—'
    const lineTotal = item.unit_price ? formatCurrency(item.unit_price * item.quantity) : '—'
    return [device, condition, String(item.quantity), unitPrice, lineTotal]
  })

  autoTable(doc, {
    startY: y,
    head: [['Device', 'Condition', 'Qty', 'Unit Price', 'Total']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [63, 63, 70],
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 60 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 30 },
    },
    margin: { left: 14, right: 14 },
  })

  // @ts-expect-error autoTable adds lastAutoTable to doc
  y = doc.lastAutoTable.finalY + 10

  // --- Totals ---
  const totalsX = pageWidth - 80

  const displayAmount = order.final_amount || order.quoted_amount || order.total_amount
  if (order.total_quantity) {
    doc.setFontSize(9)
    doc.setTextColor(113, 113, 122)
    doc.text('Total Quantity:', totalsX, y)
    doc.setTextColor(24, 24, 27)
    doc.text(String(order.total_quantity), pageWidth - 14, y, { align: 'right' })
    y += 7
  }
  if (order.total_amount) {
    doc.setTextColor(113, 113, 122)
    doc.text('Subtotal:', totalsX, y)
    doc.setTextColor(24, 24, 27)
    doc.text(formatCurrency(order.total_amount), pageWidth - 14, y, { align: 'right' })
    y += 7
  }
  if (order.quoted_amount && order.quoted_amount !== order.total_amount) {
    doc.setTextColor(113, 113, 122)
    doc.text('Quoted Amount:', totalsX, y)
    doc.setTextColor(24, 24, 27)
    doc.text(formatCurrency(order.quoted_amount), pageWidth - 14, y, { align: 'right' })
    y += 7
  }
  if (displayAmount) {
    y += 2
    doc.setDrawColor(228, 228, 231)
    doc.line(totalsX, y, pageWidth - 14, y)
    y += 7
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(24, 24, 27)
    doc.text('Total:', totalsX, y)
    doc.text(formatCurrency(displayAmount), pageWidth - 14, y, { align: 'right' })
    y += 10
  }

  // --- Buyback Guarantee (CPO orders with buyback set) ---
  const buybackItems = (order.items || []).filter(
    (item) => item.guaranteed_buyback_price != null && item.guaranteed_buyback_price > 0
  )
  if (order.type === 'cpo' && buybackItems.length > 0) {
    y += 10
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(24, 24, 27)
    doc.text('Buyback Guarantee', 14, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(63, 63, 70)
    for (const item of buybackItems) {
      const deviceName = item.device
        ? `${item.device.make || ''} ${item.device.model || ''}${item.storage ? ` (${item.storage})` : ''}`
        : 'Unknown'
      const condition = item.buyback_condition
        ? item.buyback_condition.charAt(0).toUpperCase() + item.buyback_condition.slice(1)
        : 'Good'
      const validUntil = item.buyback_valid_until
        ? formatDate(item.buyback_valid_until)
        : '24 months from quote'
      const line = `• ${deviceName}: We guarantee to buy back at ${formatCurrency(item.guaranteed_buyback_price!)} per unit if returned in ${condition} condition (valid until ${validUntil}).`
      const lines = doc.splitTextToSize(line, pageWidth - 28)
      doc.text(lines, 14, y)
      y += 6 * lines.length
    }
    y += 4
  }

  // --- Notes ---
  if (order.customer_notes) {
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(113, 113, 122)
    doc.text('NOTES', 14, y)
    y += 6
    doc.setTextColor(63, 63, 70)
    const lines = doc.splitTextToSize(order.customer_notes, pageWidth - 28)
    doc.text(lines, 14, y)
  }

  // --- Footer ---
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setDrawColor(228, 228, 231)
  doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20)
  doc.setFontSize(8)
  doc.setTextColor(161, 161, 170)
  doc.text(`Generated by ${APP_NAME} on ${new Date().toLocaleDateString()}`, 14, pageHeight - 12)
  doc.text('Thank you for your business.', pageWidth - 14, pageHeight - 12, { align: 'right' })

  // Return as Buffer
  return Buffer.from(doc.output('arraybuffer'))
}
