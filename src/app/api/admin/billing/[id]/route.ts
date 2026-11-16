// ============================================================================
// ADMIN INVOICE DETAIL API — status transitions + credits/adjustments
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { canTransitionInvoice, totalsAfterCredit, type InvoiceStatus } from '@/lib/billing'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const round2 = (n: number) => Math.round(n * 100) / 100

const patchSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'void']).optional(),
  credit: z.number().min(0).max(1_000_000).optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission('billing.manage')
  if ('error' in guard) return guard.error
  const { id } = await params

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  if (parsed.data.status === undefined && parsed.data.credit === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: inv, error: fetchErr } = await supabase
    .from('invoices').select('id, status, commission_total, subscription_fee, credit, tax_rate').eq('id', id).maybeSingle()
  if (fetchErr) return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (parsed.data.status !== undefined) {
    if (!canTransitionInvoice(inv.status as InvoiceStatus, parsed.data.status)) {
      return NextResponse.json({ error: `Cannot move an invoice from ${inv.status} to ${parsed.data.status}` }, { status: 400 })
    }
    update.status = parsed.data.status
  }

  if (parsed.data.credit !== undefined) {
    update.credit = round2(parsed.data.credit)
    // Previously total = commission + fee - credit, which dropped the tax.
    const t = totalsAfterCredit(inv.commission_total ?? 0, inv.subscription_fee ?? 0, Number(inv.tax_rate ?? 0), parsed.data.credit)
    update.tax_amount = t.taxAmount
    update.total = t.total
  }

  const { data, error } = await supabase
    .from('invoices').update(update).eq('id', id)
    .select('id, status, total, credit, tax_amount').single()
  if (error) {
    console.error('Failed to update invoice:', error)
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
  }
  return NextResponse.json({ data })
}
