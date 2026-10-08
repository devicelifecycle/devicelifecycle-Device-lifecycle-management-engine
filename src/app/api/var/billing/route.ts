// ============================================================================
// VAR BILLING API — a VAR views its own invoices from the platform
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!auth.tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 })

  const supabase = createServiceRoleClient()

  const [invoicesRes, subRes, paymentsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, period_start, period_end, status, total, currency, sent_at, paid_at, created_at')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('subscriptions')
      .select('id, plan_slug, status, billing_interval, current_period_start, current_period_end, trial_ends_at, past_due_since')
      .eq('tenant_id', auth.tenantId)
      .maybeSingle(),
    supabase
      .from('invoice_payments')
      .select('id, invoice_id, amount, type, note, created_at')
      .in('invoice_id', (await supabase
        .from('invoices')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .limit(200)).data?.map((i) => i.id) ?? [])
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  if (invoicesRes.error) {
    console.error('VAR billing: failed to load invoices', invoicesRes.error)
    return NextResponse.json({ error: 'Failed to load billing data' }, { status: 500 })
  }

  const invoices = invoicesRes.data ?? []
  const totalOwed = invoices
    .filter((i) => i.status === 'sent')
    .reduce((s, i) => s + ((i.total as number) ?? 0), 0)
  const totalPaid = invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + ((i.total as number) ?? 0), 0)

  return NextResponse.json({
    data: {
      invoices,
      subscription: subRes.data ?? null,
      payments: paymentsRes.data ?? [],
      summary: {
        totalInvoices: invoices.length,
        outstanding: totalOwed,
        paid: totalPaid,
      },
    },
  })
}
