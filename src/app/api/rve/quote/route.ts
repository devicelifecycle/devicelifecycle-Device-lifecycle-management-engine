// ============================================================================
// RESIDUAL VALUE QUOTE — compute + (optionally) email to the customer on file
// ============================================================================
// Staff-generated residual-value quote that mirrors the trade-in quote: device
// lines → per-line value → total. Each line's base is either sent explicitly
// or resolved server-side from the pricing engine's current trade price
// (device_id + storage/condition). Residuals are ALWAYS recomputed here off
// the admin-configured annual depreciation rate (pricing_settings
// .cpo_depreciation_rate) — client math is never trusted. Lines that can't be
// priced come back as per-line errors instead of failing the whole request.
// send:false returns just the numbers; send:true renders the PDF and emails it
// to the customer record. Reuses the tenant-scoped authenticated client for
// that lookup so it stays RLS-bounded. For an explicit recipient, see
// ./send/route.ts.

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

const conditionSchema = z.enum(['new', 'excellent', 'good', 'fair', 'poor', 'certified']).optional()

const schema = z.object({
  customerId: z.string().uuid(),
  horizonYears: z.number().int().min(1).max(10),
  send: z.boolean().optional(), // false = compute only (preview), true = email it
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
    const { supabase, profile } = auth

    // Residual quotes are prepared by internal staff.
    if (!['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    }
    const { customerId, horizonYears, lines } = parsed.data

    // Recompute residuals server-side (authoritative): pricing engine for base
    // values where not sent, admin-configured depreciation for the projection.
    const table = tableFromAnnualRate(await loadAnnualDepreciationRate())
    const months = horizonYears * 12
    const { priced: pricedLines, errors: lineErrors } = await resolveQuoteLines(lines, months, table)
    if (pricedLines.length === 0) {
      return NextResponse.json({ error: 'No line could be priced', lineErrors }, { status: 400 })
    }
    const total = Math.round(pricedLines.reduce((s, l) => s + l.residualValue, 0) * 100) / 100

    // Customer lookup is RLS-scoped to the actor's tenant.
    const { data: customer } = await supabase
      .from('customers').select('company_name, contact_name, contact_email').eq('id', customerId).maybeSingle()
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const quoteNumber = `RVE-${Date.now().toString(36).toUpperCase()}`
    const brand = await resolveTenantBrandLabel(profile.tenant_id ?? null, createServiceRoleClient())
    const pdf = generateRveQuotePDF({
      quoteNumber,
      customerName: customer.company_name || customer.contact_name || 'Customer',
      horizonYears,
      lines: pricedLines,
      total,
      createdAt: new Date().toISOString(),
    }, brand.name)

    // Preview mode: return the computed numbers without sending.
    if (parsed.data.send === false) {
      return NextResponse.json({ quoteNumber, total, lines: pricedLines, lineErrors, sent: false })
    }

    if (!customer.contact_email) {
      return NextResponse.json({ error: 'Customer has no email on file' }, { status: 400 })
    }

    const sent = await EmailService.sendEmailWithAttachments(
      customer.contact_email,
      `Your Residual Value Quote (${quoteNumber})`,
      `<p>Hi ${customer.contact_name || 'there'},</p>
       <p>Please find attached your residual value quote projecting device values
       over ${horizonYears} year${horizonYears > 1 ? 's' : ''}. The total projected
       residual value is <strong>$${total.toFixed(2)} CAD</strong>.</p>
       <p>This is an estimate from our depreciation table, not a binding offer.</p>`,
      [{ filename: `${quoteNumber}.pdf`, content: pdf, contentType: 'application/pdf' }],
    )

    return NextResponse.json({ quoteNumber, total, sent })
  } catch (error) {
    console.error('RVE quote failed:', error)
    return NextResponse.json({ error: 'Failed to generate residual value quote' }, { status: 500 })
  }
}