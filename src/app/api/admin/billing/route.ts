// ============================================================================
// ADMIN BILLING API — list + create BB↔VAR invoices
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { computeInvoiceTotals, formatInvoiceNumber } from '@/lib/billing'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subscription_fee: z.number().min(0).max(1_000_000).optional(),
  notes: z.string().max(2000).optional(),
})

async function adminOnly() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() as NextResponse }
  if (auth.effectiveRole !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { auth }
}

export async function GET() {
  const g = await adminOnly()
  if (g.error) return g.error

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('id, tenant_id, invoice_number, period_start, period_end, status, total, currency, created_at, tenants(name, slug)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const g = await adminOnly()
  if (g.error) return g.error

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const supabase = createServiceRoleClient()

  // A draft starts with no deal lines; commission is populated when a period is
  // reconciled against orders (reporting phase). Subscription fee applies now.
  const totals = computeInvoiceTotals([], parsed.data.subscription_fee ?? 0)

  const year = Number(parsed.data.period_start.slice(0, 4))
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .gte('period_start', `${year}-01-01`)
    .lte('period_start', `${year}-12-31`)
  const invoiceNumber = formatInvoiceNumber(year, (count ?? 0) + 1)

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      tenant_id: parsed.data.tenant_id,
      invoice_number: invoiceNumber,
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      status: 'draft',
      gross_subtotal: totals.grossSubtotal,
      commission_total: totals.commissionTotal,
      subscription_fee: totals.subscriptionFee,
      total: totals.total,
      notes: parsed.data.notes ?? null,
    })
    .select('id, invoice_number, tenant_id, status, total')
    .single()

  if (error) {
    console.error('Failed to create invoice:', error)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}
