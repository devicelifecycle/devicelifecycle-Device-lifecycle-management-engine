// ============================================================================
// RVE QUOTE SEND — email the residual-value quote as a branded PDF
// ============================================================================
// Same recomputation rules as POST /api/rve/quote (pricing-engine base values,
// admin-configured annual depreciation), but the recipient is explicit: the
// caller supplies to_email / recipient_name instead of using the customer
// record's email. Mirrors the order send-quote-email pattern — escapeHtml on
// every interpolated value and a tenant-branded cover note.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { EmailService } from '@/services/email.service'
import { tableFromAnnualRate } from '@/lib/rve'
import { loadAnnualDepreciationRate, resolveQuoteLines } from '@/lib/rve-quote'
import { generateRveQuotePDF } from '@/lib/rve-pdf'
import { resolveTenantBrandLabel } from '@/lib/tenant-brand-label'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const conditionSchema = z.enum(['new', 'excellent', 'good', 'fair', 'poor', 'certified']).optional()

const schema = z.object({
  horizonYears: z.number().int().min(1).max(10),
  to_email: z.string().email().max(200),
  recipient_name: z.string().min(1).max(120),
  lines: z.array(z.object({
    label: z.string().max(120).optional(),
    baseValue: z.number().min(0).max(1_000_000).optional(),
    device_id: z.string().uuid().optional(),
    storage: z.string().max(40).optional(),
    condition: conditionSchema,
  })).min(1).max(50),
})

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { profile } = auth

    // Same internal-staff gate as the compute route.
    if (!['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    }
    const { horizonYears, to_email, recipient_name, lines } = parsed.data

    const table = tableFromAnnualRate(await loadAnnualDepreciationRate())
    const { priced: pricedLines, errors: lineErrors } = await resolveQuoteLines(lines, horizonYears * 12, table)
    if (pricedLines.length === 0) {
      return NextResponse.json({ error: 'No line could be priced', lineErrors }, { status: 400 })
    }
    const total = Math.round(pricedLines.reduce((s, l) => s + l.residualValue, 0) * 100) / 100

    const quoteNumber = `RVE-${Date.now().toString(36).toUpperCase()}`
    const brand = await resolveTenantBrandLabel(profile.tenant_id ?? null, createServiceRoleClient())
    const pdf = generateRveQuotePDF({
      quoteNumber,
      customerName: recipient_name,
      horizonYears,
      lines: pricedLines,
      total,
      createdAt: new Date().toISOString(),
    }, brand.name)

    const safeName = escapeHtml(recipient_name)
    const safeBrand = escapeHtml(brand.name)
    const safeTotal = escapeHtml(`$${total.toFixed(2)} CAD`)
    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#111">Your Residual Value Quote — ${escapeHtml(quoteNumber)}</h2>
  <p>Hi ${safeName},</p>
  <p>Please find attached your residual value quote projecting device values over ${horizonYears} year${horizonYears > 1 ? 's' : ''}.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600;border:1px solid #e0e0e0">Devices quoted</td><td style="padding:6px 12px;border:1px solid #e0e0e0">${pricedLines.length}</td></tr>
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600;border:1px solid #e0e0e0">Projected residual value</td><td style="padding:6px 12px;border:1px solid #e0e0e0">${safeTotal}</td></tr>
  </table>
  <p style="margin:8px 0;font-size:13px;color:#555">This is an estimate projected from our depreciation table, not a binding offer.</p>
  <p>If you have any questions, please contact our team.</p>
  <p style="color:#888;font-size:12px;margin-top:32px">— ${safeBrand}</p>
</div>`

    const sent = await EmailService.sendEmailWithAttachments(
      to_email,
      `Your Residual Value Quote (${quoteNumber})`,
      html,
      [{ filename: `${quoteNumber}.pdf`, content: pdf, contentType: 'application/pdf' }],
    )

    return NextResponse.json({ quoteNumber, total, sent })
  } catch (error) {
    console.error('RVE quote send failed:', error)
    return NextResponse.json({ error: 'Failed to send residual value quote' }, { status: 500 })
  }
}