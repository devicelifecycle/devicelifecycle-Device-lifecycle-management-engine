// ============================================================================
// PDF GENERATION UTILITY (jsPDF + autoTable)
// ============================================================================

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { computeOrderTaxLine } from './tax'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Byte-Back'

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
  currency?: string
  fx_rate?: number
  quote_expires_at?: string
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
    actual_condition?: string
    unit_price?: number
    quoted_price?: number
    final_price?: number
    guaranteed_buyback_price?: number
    buyback_condition?: string
    buyback_valid_until?: string
  }[]
}

/**
 * Amounts are stored in CAD. When an order is quoted in another currency it
 * carries a frozen CAD->currency multiplier (fxRate); we convert here and append
 * the currency code so "$" is never ambiguous between CAD and USD.
 */
function formatCurrency(amount: number, fxRate = 1, currency = 'CAD'): string {
  const converted = amount * (fxRate || 1)
  const num = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(converted)
  return `$${num} ${(currency || 'CAD').toUpperCase()}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Toronto',
  })
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Single source of truth for "why did this item's price change" — used by
 * both the PDF (appended section, see generateOrderPDF) and the Excel
 * Line Items sheet (buildExcelBuffer, send-quote-email/route.ts) so the two
 * documents never describe the same adjustment two different ways. Returns
 * null when there's nothing to explain (actual_condition unset or matches
 * claimed_condition — the common case for items that passed triage as-is).
 */
export function buildPriceAdjustmentNote(item: {
  claimed_condition?: string
  actual_condition?: string
  quoted_price?: number
  final_price?: number
  unit_price?: number
}, fxRate = 1, currency = 'CAD'): string | null {
  if (!item.actual_condition || !item.claimed_condition || item.actual_condition === item.claimed_condition) {
    return null
  }
  const before = item.quoted_price
  const after = item.final_price ?? item.unit_price
  let note = `Condition reassessed during inspection: claimed ${capitalize(item.claimed_condition)}, found ${capitalize(item.actual_condition)}.`
  if (before != null && after != null && before !== after) {
    note += ` Price adjusted from ${formatCurrency(before, fxRate, currency)} to ${formatCurrency(after, fxRate, currency)}.`
  }
  return note
}

export function generateOrderPDF(order: OrderPDFData): Buffer {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  // Display currency: amounts are stored in CAD; convert via the order's frozen rate.
  const fx = order.fx_rate ?? 1
  const cur = order.currency ?? 'CAD'
  const money = (amount: number) => formatCurrency(amount, fx, cur)

  // --- Header ---
  doc.setFillColor(24, 24, 27) // zinc-900
  doc.rect(0, 0, pageWidth, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(APP_NAME, 14, 22)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  // It's a QUOTE until money is actually due/moving. The old allowlist
  // (['submitted','quoted']) mislabeled an accepted/sourcing CPO as an INVOICE.
  const isQuote = !['payment_processing', 'payment_sent', 'closed'].includes(order.status)
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
  y += 6

  // --- Quote validity notice (quotes only, not invoices) ---
  if (isQuote) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(182, 93, 47) // brand copper
    const validityDays = (order.quote_expires_at && order.quoted_at)
      ? Math.max(1, Math.round((new Date(order.quote_expires_at).getTime() - new Date(order.quoted_at).getTime()) / (1000 * 60 * 60 * 24)))
      : 30
    doc.text(
      order.quote_expires_at
        ? `This quote is valid for ${validityDays} days (expires ${formatDate(order.quote_expires_at)}).`
        : `This quote is valid for ${validityDays} days.`,
      14, y
    )
    doc.setFont('helvetica', 'normal')
    y += 6
  }

  y += 6

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
    const unitPrice = item.unit_price ? money(item.unit_price) : '—'
    const lineTotal = item.unit_price ? money(item.unit_price * item.quantity) : '—'
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
    doc.text(money(order.total_amount), pageWidth - 14, y, { align: 'right' })
    y += 7
  }
  if (order.quoted_amount && order.quoted_amount !== order.total_amount) {
    doc.setTextColor(113, 113, 122)
    doc.text('Quoted Amount:', totalsX, y)
    doc.setTextColor(24, 24, 27)
    doc.text(money(order.quoted_amount), pageWidth - 14, y, { align: 'right' })
    y += 7
  }
  // CPO invoices are taxable — resolve the rate from the customer's billing
  // province/state and show a Tax line so the Total is tax-inclusive. Trade-in
  // payouts and unresolvable jurisdictions get no tax line.
  const taxLine = computeOrderTaxLine({ type: order.type, subtotal: displayAmount, billingAddress: order.customer?.billing_address })
  const taxAmount = taxLine?.taxAmount ?? 0
  if (taxLine) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(113, 113, 122)
    doc.text('Subtotal:', totalsX, y)
    doc.setTextColor(24, 24, 27)
    doc.text(money(taxLine.subtotal), pageWidth - 14, y, { align: 'right' })
    y += 7
    doc.setTextColor(113, 113, 122)
    doc.text(`${taxLine.label}:`, totalsX, y)
    doc.setTextColor(24, 24, 27)
    doc.text(money(taxAmount), pageWidth - 14, y, { align: 'right' })
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
    doc.text(money(displayAmount + taxAmount), pageWidth - 14, y, { align: 'right' })
    y += 10
  }

  // --- Price Adjustment Details (devices where inspection found a
  //     different condition than reported) — appended after the table
  //     rather than interleaved into it, same approach as Buyback
  //     Guarantee below: autoTable's column alignment shouldn't have to
  //     accommodate a variable-height explanation row. ---
  const adjustedItems = (order.items || []).filter((item) => buildPriceAdjustmentNote(item, fx, cur) != null)
  if (adjustedItems.length > 0) {
    y += 4
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(24, 24, 27)
    doc.text('Price Adjustment Details', 14, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(63, 63, 70)
    for (const item of adjustedItems) {
      const deviceName = item.device
        ? `${item.device.make || ''} ${item.device.model || ''}${item.storage ? ` (${item.storage})` : ''}`
        : 'Unknown'
      const note = buildPriceAdjustmentNote(item, fx, cur)
      const line = `• ${deviceName}: ${note}`
      const lines = doc.splitTextToSize(line, pageWidth - 28)
      doc.text(lines, 14, y)
      y += 6 * lines.length
    }
    y += 4
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
      const line = `• ${deviceName}: We guarantee to buy back at ${money(item.guaranteed_buyback_price!)} per unit if returned in ${condition} condition (valid until ${validUntil}).`
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
  doc.text(`Generated by ${APP_NAME} on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Toronto', year: 'numeric', month: 'short', day: 'numeric' })}`, 14, pageHeight - 12)
  doc.text('Thank you for your business.', pageWidth - 14, pageHeight - 12, { align: 'right' })

  // Return as Buffer
  return Buffer.from(doc.output('arraybuffer'))
}

interface OrderHistoryRow {
  order_number: string
  type: string
  status: string
  created_at: string
  total_quantity?: number
  total_amount?: number
  quoted_amount?: number
}

export function generateOrderHistoryPDF(customerName: string, orders: OrderHistoryRow[]): Buffer {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  doc.setFillColor(24, 24, 27)
  doc.rect(0, 0, pageWidth, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(APP_NAME, 14, 22)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('ORDER HISTORY', pageWidth - 14, 22, { align: 'right' })

  y = 48
  doc.setTextColor(113, 113, 122)
  doc.setFontSize(9)
  doc.text('CUSTOMER', 14, y)
  doc.text('GENERATED', 100, y)
  doc.text('TOTAL ORDERS', 155, y)
  y += 6
  doc.setTextColor(24, 24, 27)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(customerName, 14, y)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(new Date().toISOString()), 100, y)
  doc.text(String(orders.length), 155, y)
  y += 12

  const tableBody = orders.map((o) => [
    o.order_number,
    o.type === 'trade_in' ? 'Trade-In' : 'CPO',
    o.status.replace(/_/g, ' '),
    formatDate(o.created_at),
    o.total_quantity != null ? String(o.total_quantity) : '—',
    formatCurrency(o.quoted_amount ?? o.total_amount ?? 0),
  ])

  autoTable(doc, {
    startY: y,
    head: [['Order #', 'Type', 'Status', 'Date', 'Qty', 'Amount']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: [63, 63, 70] },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      4: { halign: 'center', cellWidth: 18 },
      5: { halign: 'right', cellWidth: 28 },
    },
    margin: { left: 14, right: 14 },
  })

  // @ts-expect-error autoTable adds lastAutoTable to doc
  y = doc.lastAutoTable.finalY + 10

  const totalValue = orders.reduce((sum, o) => sum + (o.quoted_amount ?? o.total_amount ?? 0), 0)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(24, 24, 27)
  doc.text('Total Value:', pageWidth - 80, y)
  doc.text(formatCurrency(totalValue), pageWidth - 14, y, { align: 'right' })

  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setDrawColor(228, 228, 231)
  doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(161, 161, 170)
  doc.text(`Generated by ${APP_NAME} on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Toronto', year: 'numeric', month: 'short', day: 'numeric' })}`, 14, pageHeight - 12)

  return Buffer.from(doc.output('arraybuffer'))
}
