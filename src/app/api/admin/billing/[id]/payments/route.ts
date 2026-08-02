// ============================================================================
// ADMIN INVOICE PAYMENTS — list history / record a payment or refund
// ============================================================================
// Recording a payment that clears the balance auto-marks a "sent" invoice paid.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { summarizePayments, type PaymentRecord } from '@/lib/payments'
import { canTransitionInvoice, type InvoiceStatus } from '@/lib/billing'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  kind: z.enum(['payment', 'refund']),
  amount: z.number().positive().max(10_000_000),
  note: z.string().max(500).optional(),
})

async function adminOnly() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() as NextResponse }
  if (auth.effectiveRole !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { auth }
}

async function loadInvoice(supabase: ReturnType<typeof createServiceRoleClient>, id: string) {
  const { data } = await supabase.from('invoices').select('id, total, status').eq('id', id).maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await adminOnly()
  if (g.error) return g.error
  const { id } = await params
  const supabase = createServiceRoleClient()

  const invoice = await loadInvoice(supabase, id)
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: rows } = await supabase.from('invoice_payments')
    .select('id, kind, amount, note, created_at').eq('invoice_id', id).order('created_at', { ascending: false })

  const summary = summarizePayments(invoice.total ?? 0, (rows ?? []) as PaymentRecord[])
  return NextResponse.json({ data: { payments: rows ?? [], summary } })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await adminOnly()
  if (g.error) return g.error
  const { id } = await params
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })

  const supabase = createServiceRoleClient()
  const invoice = await loadInvoice(supabase, id)
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('invoice_payments')
    .insert({ invoice_id: id, kind: parsed.data.kind, amount: parsed.data.amount, note: parsed.data.note ?? null, created_by: g.auth.profile.id })
  if (error) {
    console.error('Failed to record payment:', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }

  // Recompute; if the balance is cleared and the invoice is "sent", mark it paid.
  const { data: rows } = await supabase.from('invoice_payments').select('kind, amount').eq('invoice_id', id)
  const summary = summarizePayments(invoice.total ?? 0, (rows ?? []) as PaymentRecord[])
  if (summary.fullyPaid && canTransitionInvoice(invoice.status as InvoiceStatus, 'paid')) {
    await supabase.from('invoices').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', id)
  }

  return NextResponse.json({ data: { summary } }, { status: 201 })
}
