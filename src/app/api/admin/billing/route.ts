// ============================================================================
// ADMIN BILLING API — list + create BB↔VAR invoices
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { computeInvoiceTotals, formatInvoiceNumber } from '@/lib/billing'
import { resolveTaxRate } from '@/lib/tax'
import { parsePaging } from '@/lib/paging'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subscription_fee: z.number().min(0).max(1_000_000).optional(),
  notes: z.string().max(2000).optional(),
})

export async function GET(request: NextRequest) {
  const guard = await requirePermission('billing.view')
  if ('error' in guard) return guard.error

  const { page, limit, from, to } = parsePaging(request)
  const supabase = createServiceRoleClient()
  const { data, error, count } = await supabase
    .from('invoices')
    .select('id, tenant_id, invoice_number, period_start, period_end, status, total, currency, created_at, tenants(name, slug)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 })
  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

export async function POST(request: NextRequest) {
  const guard = await requirePermission('billing.manage')
  if ('error' in guard) return guard.error

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const supabase = createServiceRoleClient()

  // Resolve tax from the tenant's organization billing address
  const { data: org } = await supabase
    .from('organizations')
    .select('address')
    .eq('tenant_id', parsed.data.tenant_id)
    .limit(1)
    .maybeSingle()
  const addr = org?.address as Record<string, unknown> | null
  const province = (addr?.state ?? addr?.province ?? '') as string
  const country = (addr?.country ?? '') as string
  const taxResult = resolveTaxRate(province, country)
  const tax = taxResult.rate > 0 ? { rate: taxResult.rate, label: taxResult.label } : undefined

  const totals = computeInvoiceTotals([], parsed.data.subscription_fee ?? 0, tax)

  const year = Number(parsed.data.period_start.slice(0, 4))
  // Atomic, concurrency-safe sequence (see next_invoice_seq in the migration).
  const { data: seq, error: seqErr } = await supabase.rpc('next_invoice_seq', { p_year: year })
  if (seqErr || typeof seq !== 'number') {
    console.error('Failed to allocate invoice number:', seqErr)
    return NextResponse.json({ error: 'Failed to allocate invoice number' }, { status: 500 })
  }
  const invoiceNumber = formatInvoiceNumber(year, seq)

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
      tax_rate: totals.taxRate,
      tax_label: totals.taxLabel || null,
      tax_amount: totals.taxAmount,
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
