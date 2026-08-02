// ============================================================================
// ADMIN BILLING — reconcile a draft invoice against its period's orders
// ============================================================================
// Rebuilds the invoice's line items from the VAR tenant's orders in the billing
// period (charge per deal = BB blended take), then updates the invoice totals.
// Only draft invoices can be reconciled. Additive — no order data is modified.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commissionConfigFromSettings } from '@/lib/commission'
import { reconcilePeriod, type PeriodOrder } from '@/lib/billing-reconcile'
export const dynamic = 'force-dynamic'

// Statuses that don't count toward billed revenue.
const NON_BILLABLE = ['draft', 'submitted', 'cancelled', 'rejected']

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const supabase = createServiceRoleClient()
  const { data: invoice, error: invErr } = await supabase
    .from('invoices').select('id, tenant_id, period_start, period_end, status, subscription_fee').eq('id', id).maybeSingle()
  if (invErr) return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft invoices can be reconciled' }, { status: 400 })
  }

  // The VAR's commission model + the period's billable orders on that tenant.
  const [{ data: tenant }, { data: rows }] = await Promise.all([
    supabase.from('tenants').select('settings').eq('id', invoice.tenant_id).maybeSingle(),
    supabase.from('orders')
      .select('order_number, type, status, quoted_amount, total_amount, final_amount')
      .eq('tenant_id', invoice.tenant_id)
      .gte('created_at', invoice.period_start)
      .lte('created_at', `${invoice.period_end}T23:59:59`)
      .not('status', 'in', `(${NON_BILLABLE.join(',')})`),
  ])

  const config = commissionConfigFromSettings(tenant?.settings)
  const orders: PeriodOrder[] = (rows ?? []).map((o) => ({
    order_number: (o.order_number as string) ?? '—',
    type: (o.type as string) ?? 'trade_in',
    amount: (o.final_amount as number) ?? (o.quoted_amount as number) ?? (o.total_amount as number) ?? 0,
  }))

  const { lineItems, totals } = reconcilePeriod(orders, config, invoice.subscription_fee ?? 0)

  // Replace the invoice's deal lines, then update its totals.
  await supabase.from('invoice_line_items').delete().eq('invoice_id', id)
  if (lineItems.length > 0) {
    await supabase.from('invoice_line_items').insert(
      lineItems.map((l) => ({ invoice_id: id, description: l.description, gross_amount: l.grossAmount, commission_amount: l.commissionAmount })),
    )
  }
  const { error: upErr } = await supabase.from('invoices').update({
    gross_subtotal: totals.grossSubtotal,
    commission_total: totals.commissionTotal,
    total: totals.total,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (upErr) return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })

  return NextResponse.json({ data: { orders: orders.length, ...totals } })
}
