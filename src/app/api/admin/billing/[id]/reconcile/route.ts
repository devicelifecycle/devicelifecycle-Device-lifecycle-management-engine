// ============================================================================
// ADMIN BILLING — reconcile a draft invoice against its period's orders
// ============================================================================
// Rebuilds the invoice's line items from the VAR tenant's orders in the billing
// period (charge per deal = BB blended take), then updates the invoice totals.
// Only draft invoices can be reconciled. Additive — no order data is modified.

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commissionConfigFromSettings } from '@/lib/commission'
import { reconcilePeriod, type PeriodOrder, BILLABLE_ORDER_STATUSES } from '@/lib/billing-reconcile'
import { resolveTaxRate } from '@/lib/tax'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('billing.manage')
  if ('error' in guard) return guard.error
  const { id } = await params

  const supabase = createServiceRoleClient()
  const { data: invoice, error: invErr } = await supabase
    .from('invoices').select('id, tenant_id, period_start, period_end, status, subscription_fee').eq('id', id).maybeSingle()
  if (invErr) return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft invoices can be reconciled' }, { status: 400 })
  }

  // The VAR's commission model + the period's billable orders + billing address for tax.
  const [{ data: tenant }, { data: rows }, { data: org }] = await Promise.all([
    supabase.from('tenants').select('settings').eq('id', invoice.tenant_id).maybeSingle(),
    supabase.from('orders')
      .select('order_number, type, status, quoted_amount, total_amount, final_amount')
      .eq('tenant_id', invoice.tenant_id)
      .gte('created_at', invoice.period_start)
      .lte('created_at', `${invoice.period_end}T23:59:59`)
      .in('status', BILLABLE_ORDER_STATUSES),
    supabase.from('organizations').select('address').eq('tenant_id', invoice.tenant_id).limit(1).maybeSingle(),
  ])

  const config = commissionConfigFromSettings(tenant?.settings)
  const orders: PeriodOrder[] = (rows ?? []).map((o) => ({
    order_number: (o.order_number as string) ?? '—',
    type: (o.type as string) ?? 'trade_in',
    amount: (o.final_amount as number) ?? (o.quoted_amount as number) ?? (o.total_amount as number) ?? 0,
  }))

  const addr = org?.address as Record<string, unknown> | null
  const province = (addr?.state ?? addr?.province ?? '') as string
  const country = (addr?.country ?? '') as string
  const taxResult = resolveTaxRate(province, country)
  const tax = taxResult.rate > 0 ? { rate: taxResult.rate, label: taxResult.label } : undefined

  const { lineItems, totals } = reconcilePeriod(orders, config, invoice.subscription_fee ?? 0, tax)

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
    tax_rate: totals.taxRate,
    tax_label: totals.taxLabel || null,
    tax_amount: totals.taxAmount,
    total: totals.total,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (upErr) return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })

  return NextResponse.json({ data: { orders: orders.length, ...totals } })
}
