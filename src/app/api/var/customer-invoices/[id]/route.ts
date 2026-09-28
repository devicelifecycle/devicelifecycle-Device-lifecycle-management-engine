// ============================================================================
// VAR → CUSTOMER INVOICE — detail, status transitions, payments
// ============================================================================
// PATCH actions: 'send' (draft → sent), 'void', 'record_payment',
// 'record_refund'. Status moves go through the same canTransitionInvoice
// state machine the BB→VAR invoices use, so the two billing surfaces can't
// drift apart on what a legal transition is.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { hasPermission, type PermissionKey } from '@/lib/permissions'
import { canTransitionInvoice, type InvoiceStatus } from '@/lib/billing'
import { resolveBillingMode, invoiceBalance, maxRefundable } from '@/lib/customer-billing'
import { isValidUUID } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({ action: z.literal('void') }),
  z.object({
    action: z.literal('record_payment'),
    amount: z.number().positive().max(10_000_000),
    method: z.string().max(40).optional(),
    reference: z.string().max(200).optional(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('record_refund'),
    amount: z.number().positive().max(10_000_000),
    method: z.string().max(40).optional(),
    reference: z.string().max(200).optional(),
    note: z.string().max(500).optional(),
  }),
])

async function load(id: string, permission: PermissionKey = 'billing.view') {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() }
  // Reading an invoice needs billing.view; sending, voiding or recording money
  // against it needs billing.manage. Both were gated on view, which gave
  // invoice write access to every role that can merely look at billing.
  const allowed = auth.effectiveRole === 'admin' || hasPermission(auth.effectiveRole, permission)
  if (!allowed) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!auth.tenantId) return { error: NextResponse.json({ error: 'No tenant in scope' }, { status: 400 }) }
  if (!isValidUUID(id)) return { error: NextResponse.json({ error: 'Invalid invoice id' }, { status: 400 }) }

  const supabase = createServiceRoleClient()
  const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', auth.tenantId).maybeSingle()
  if (resolveBillingMode(tenant?.settings) !== 'in_platform') {
    return { error: NextResponse.json({ error: 'In-platform customer invoicing is off for this organization.', code: 'billing_mode_external' }, { status: 409 }) }
  }

  // Scoped by tenant: an invoice id from another VAR reads as not found.
  const { data: invoice, error } = await supabase
    .from('customer_invoices').select('*').eq('id', id).eq('tenant_id', auth.tenantId).maybeSingle()
  if (error) return { error: NextResponse.json({ error: 'Could not load invoice' }, { status: 500 }) }
  if (!invoice) return { error: NextResponse.json({ error: 'Invoice not found' }, { status: 404 }) }
  return { auth, supabase, invoice, tenantId: auth.tenantId }
}

async function paymentsFor(supabase: ReturnType<typeof createServiceRoleClient>, invoiceId: string) {
  const { data } = await supabase
    .from('customer_invoice_payments')
    .select('id, kind, amount, method, reference, note, created_at')
    .eq('invoice_id', invoiceId).order('created_at', { ascending: false })
  return (data ?? []).map((p) => ({ ...p, amount: Number(p.amount) }))
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await load((await params).id)
  if (g.error) return g.error
  const { supabase, invoice } = g

  const [{ data: lines }, payments] = await Promise.all([
    supabase.from('customer_invoice_line_items')
      .select('id, order_id, description, quantity, unit_amount, amount').eq('invoice_id', invoice.id),
    paymentsFor(supabase, invoice.id as string),
  ])
  const { data: customer } = await supabase
    .from('customers').select('id, company_name, contact_name, contact_email, billing_address')
    .eq('id', invoice.customer_id as string).maybeSingle()

  return NextResponse.json({
    data: {
      ...invoice,
      customer: customer ?? null,
      lines: lines ?? [],
      payments,
      balance: invoiceBalance(Number(invoice.total), payments.map((p) => ({ kind: p.kind as 'payment' | 'refund', amount: p.amount }))),
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await load((await params).id, 'billing.manage')
  if (g.error) return g.error
  const { auth, supabase, invoice, tenantId } = g

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const body = parsed.data
  const status = invoice.status as InvoiceStatus

  if (body.action === 'send' || body.action === 'void') {
    const next: InvoiceStatus = body.action === 'send' ? 'sent' : 'void'
    if (!canTransitionInvoice(status, next)) {
      return NextResponse.json({ error: `Cannot move an invoice from ${status} to ${next}` }, { status: 400 })
    }
    const { error } = await supabase.from('customer_invoices')
      .update({
        status: next,
        ...(next === 'sent' ? { sent_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice.id).eq('tenant_id', tenantId)
    if (error) {
      console.error('customer-invoice transition failed', error)
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
    }
    return NextResponse.json({ data: { id: invoice.id, status: next } })
  }

  // ── Payments / refunds ────────────────────────────────────────────────────
  // Through record_customer_invoice_payment, which takes a row lock on the
  // invoice and does the cap check, the insert and the status move in one
  // statement. The previous version read the balance, checked it, then
  // inserted: two payments issued at the same moment both read the same
  // balance, both passed, and both landed — over-paying the invoice with
  // nothing to stop it. Exactly the bug already fixed for BB→VAR invoices.
  //
  // The status move lives in the RPC too, so it can only ever apply a legal
  // transition (sent→paid on settlement, paid→sent when a refund re-opens it).
  // The JS version could write draft→paid, which canTransitionInvoice forbids.
  const { data: result, error: rpcErr } = await supabase.rpc('record_customer_invoice_payment', {
    p_invoice_id: invoice.id,
    p_tenant_id: tenantId,
    p_kind: body.action === 'record_refund' ? 'refund' : 'payment',
    p_amount: body.amount,
    p_method: body.method ?? null,
    p_reference: body.reference ?? null,
    p_note: body.note ?? null,
    p_created_by: auth.profile.id,
  })
  if (rpcErr) {
    console.error('customer-invoice payment failed', rpcErr)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }

  const r = result as { ok: boolean; error?: string; max?: number; status?: string; total?: number; net_paid?: number; balance?: number } | null
  if (!r?.ok) {
    const messages: Record<string, string> = {
      void: 'This invoice is void — it cannot take payments.',
      not_found: 'Invoice not found.',
      invalid_amount: 'Enter a positive amount.',
      invalid_kind: 'Unknown payment type.',
      exceeds_net: `Refund exceeds what has been paid on this invoice (max ${Number(r?.max ?? 0).toFixed(2)}).`,
      exceeds_balance: `Payment exceeds the outstanding balance (${Number(r?.max ?? 0).toFixed(2)}).`,
    }
    const msg = messages[r?.error ?? ''] ?? 'Could not record the payment.'
    return NextResponse.json({ error: msg }, { status: r?.error === 'not_found' ? 404 : 400 })
  }

  return NextResponse.json({
    data: {
      id: invoice.id,
      status: r.status,
      balance: invoiceBalance(Number(r.total ?? 0), [{ kind: 'payment', amount: Number(r.net_paid ?? 0) }]),
    },
  })
}
