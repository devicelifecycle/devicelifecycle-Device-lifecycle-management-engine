// ============================================================================
// ADMIN BILLING -- reconcile a period's orders into a VAR commission invoice
// ============================================================================
// Option-A-compatible reconciliation: Byte-Back bills each VAR (the platform's
// customer) one commission invoice per billing period. The period's closed/
// paid orders become line items charged at BB's blended take. Idempotent: a
// tenant+period pair can only ever have one live invoice, so re-running the
// same reconcile returns the existing invoice instead of double-billing.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commissionConfigFromSettings } from '@/lib/commission'
import { reconcilePeriod, type PeriodOrder } from '@/lib/billing-reconcile'
import { formatInvoiceNumber } from '@/lib/billing'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/

const reconcileSchema = z.object({
  tenant_id: z.string().uuid(),
  period_start: z.string().regex(DATE),
  period_end: z.string().regex(DATE),
})

/** Statuses where the money has actually moved (payment sent or period closed). */
const BILLABLE_STATUSES = ['payment_sent', 'closed']

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = reconcileSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const { tenant_id, period_start, period_end } = parsed.data

  const startMs = Date.parse(`${period_start}T00:00:00Z`)
  const endMs = Date.parse(`${period_end}T00:00:00Z`)
  if (!(endMs > startMs)) {
    return NextResponse.json({ error: 'period_end must be after period_start' }, { status: 400 })
  }
  // Cap the window at one quarter so a stray range cannot sweep the whole table.
  if ((endMs - startMs) / 86_400_000 > 92) {
    return NextResponse.json({ error: 'Billing period cannot exceed 92 days' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Idempotency guard: invoices carry period_start/period_end columns natively,
  // so an existing live invoice for this exact tenant+period means already done.
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('tenant_id', tenant_id)
    .eq('period_start', period_start)
    .eq('period_end', period_end)
    .neq('status', 'void')
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: 'An invoice for this VAR and period already exists', data: { id: existing.id, invoice_number: existing.invoice_number } },
      { status: 409 },
    )
  }

  // The VAR commission model + its money-moved orders in the window.
  const [{ data: tenant }, { data: rows }] = await Promise.all([
    supabase.from('tenants').select('settings').eq('id', tenant_id).maybeSingle(),
    supabase.from('orders')
      .select('order_number, type, final_amount, quoted_amount, total_amount')
      .eq('tenant_id', tenant_id)
      .in('status', BILLABLE_STATUSES)
      .gte('created_at', period_start)
      .lte('created_at', `${period_end}T23:59:59`),
  ])

  const config = commissionConfigFromSettings(tenant?.settings)
  const orders: PeriodOrder[] = (rows ?? []).map((o) => ({
    order_number: (o.order_number as string) ?? '--',
    type: (o.type as string) ?? 'trade_in',
    amount: (o.final_amount as number) ?? (o.quoted_amount as number) ?? (o.total_amount as number) ?? 0,
  }))

  const { lineItems, totals } = reconcilePeriod(orders, config)

  // Atomic, concurrency-safe numbering -- same scheme as manual draft creation.
  const year = Number(period_start.slice(0, 4))
  const { data: seq, error: seqErr } = await supabase.rpc('next_invoice_seq', { p_year: year })
  if (seqErr || typeof seq !== 'number') {
    console.error('Failed to allocate invoice number:', seqErr)
    return NextResponse.json({ error: 'Failed to allocate invoice number' }, { status: 500 })
  }
  const invoiceNumber = formatInvoiceNumber(year, seq)

  const { data: invoice, error: insErr } = await supabase
    .from('invoices')
    .insert({
      tenant_id,
      invoice_number: invoiceNumber,
      period_start,
      period_end,
      status: 'draft',
      gross_subtotal: totals.grossSubtotal,
      commission_total: totals.commissionTotal,
      subscription_fee: totals.subscriptionFee,
      total: totals.total,
      notes: `Reconciled ${orders.length} order(s) for ${period_start} .. ${period_end}`,
    })
    .select('id, invoice_number')
    .single()
  if (insErr || !invoice) {
    console.error('Failed to create reconciled invoice:', insErr)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }

  if (lineItems.length > 0) {
    const { error: linesErr } = await supabase.from('invoice_line_items').insert(
      lineItems.map((l) => ({
        invoice_id: invoice.id,
        description: l.description,
        gross_amount: l.grossAmount,
        commission_amount: l.commissionAmount,
      })),
    )
    if (linesErr) {
      console.error('Failed to attach line items:', linesErr)
      return NextResponse.json({ error: 'Invoice created but line items failed to save' }, { status: 500 })
    }
  }

  return NextResponse.json(
    { data: { id: invoice.id, invoice_number: invoice.invoice_number, orders_count: orders.length, total_commission: totals.commissionTotal, total: totals.total } },
    { status: 201 },
  )
}
