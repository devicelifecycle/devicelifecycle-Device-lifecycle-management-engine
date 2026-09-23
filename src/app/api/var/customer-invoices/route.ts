// ============================================================================
// VAR → CUSTOMER INVOICES — list / create (Billing Option B)
// ============================================================================
// Only available to a tenant whose billingMode is 'in_platform'. A tenant on
// Option A (the default) gets a 409 explaining that they bill outside the
// platform — not a 403, because nothing is forbidden, the mode is just off.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { featureGate } from '@/lib/supabase/require-feature'
import { hasPermission, type PermissionKey } from '@/lib/permissions'
import { customerScopeFilter } from '@/lib/delegation'
import {
  resolveBillingMode, buildInvoiceDraft, invoiceBalance,
  formatCustomerInvoiceNumber, type BillableOrder,
} from '@/lib/customer-billing'
import { isValidUUID } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  customer_id: z.string().uuid(),
  /** Orders to bill. Omit to bill every completed, not-yet-invoiced order. */
  order_ids: z.array(z.string().uuid()).max(500).optional(),
  due_days: z.number().int().min(0).max(365).optional(),
  notes: z.string().max(2000).optional(),
  taxable: z.boolean().optional(),
})

/** Billable = the order is finished and the customer owes for it. */
// Verified against the live enum (2026-09-22): there is no 'completed'
// status, and querying one 400s the whole request.
const BILLABLE_STATUSES = ['closed', 'payment_sent', 'delivered']

async function guard() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() }
  const allowed = auth.effectiveRole === 'admin'
    || hasPermission(auth.effectiveRole, 'billing.view' as PermissionKey)
  if (!allowed) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!auth.tenantId) return { error: NextResponse.json({ error: 'No tenant in scope' }, { status: 400 }) }

  const gate = await featureGate(auth.tenantId, 'billing', 'Billing')
  if (gate) return { error: gate }

  const supabase = createServiceRoleClient()
  const { data: tenant, error } = await supabase.from('tenants').select('settings').eq('id', auth.tenantId).maybeSingle()
  if (error) return { error: NextResponse.json({ error: 'Could not read billing settings' }, { status: 503 }) }
  if (resolveBillingMode(tenant?.settings) !== 'in_platform') {
    return {
      error: NextResponse.json({
        error: 'In-platform customer invoicing is off for this organization. You bill your customers in your own system (Option A). Switch billing mode on the VAR console to use this.',
        code: 'billing_mode_external',
      }, { status: 409 }),
    }
  }
  return { auth, supabase, tenantId: auth.tenantId }
}

export async function GET(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  const { supabase, tenantId, auth } = g

  const customerId = req.nextUrl.searchParams.get('customer_id')
  if (customerId && !isValidUUID(customerId)) {
    return NextResponse.json({ error: 'customer_id must be a UUID' }, { status: 400 })
  }

  let q = supabase
    .from('customer_invoices')
    .select('id, customer_id, invoice_number, status, issue_date, due_date, subtotal, tax_amount, tax_label, total, currency, sent_at, created_at, customer:customers(company_name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (customerId) q = q.eq('customer_id', customerId)

  // A delegated user only sees invoices for customers in their own scope —
  // same filter the customer lists use, including its safer fallback (a
  // regional manager with no region set is narrowed to their own customers
  // rather than widened to the tenant).
  const scope = customerScopeFilter({
    role: auth.effectiveRole, userId: auth.profile.id, region: auth.profile.region,
  })
  if (scope) {
    const { data: scoped } = await supabase
      .from('customers').select('id').eq('tenant_id', tenantId).eq(scope.column, scope.value)
    q = q.in('customer_id', (scoped ?? []).map((c) => c.id as string))
  }

  const { data, error } = await q
  if (error) {
    console.error('customer-invoices list failed', error)
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 })
  }

  const ids = (data ?? []).map((i) => i.id as string)
  const paymentsByInvoice = new Map<string, { kind: 'payment' | 'refund'; amount: number }[]>()
  if (ids.length) {
    const { data: pays } = await supabase
      .from('customer_invoice_payments').select('invoice_id, kind, amount').in('invoice_id', ids)
    for (const p of pays ?? []) {
      const list = paymentsByInvoice.get(p.invoice_id as string) ?? []
      list.push({ kind: p.kind as 'payment' | 'refund', amount: Number(p.amount) })
      paymentsByInvoice.set(p.invoice_id as string, list)
    }
  }

  return NextResponse.json({
    data: (data ?? []).map((i) => ({
      ...i,
      balance: invoiceBalance(Number(i.total), paymentsByInvoice.get(i.id as string) ?? []),
    })),
  })
}

export async function POST(req: NextRequest) {
  const g = await guard()
  if (g.error) return g.error
  const { supabase, tenantId, auth } = g

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const { customer_id, order_ids, due_days, notes, taxable } = parsed.data

  // The customer must belong to this tenant — never bill across tenants — and
  // to the caller's own delegation scope, so a rep can't raise an invoice
  // against a customer that isn't theirs. Out-of-scope reads as "not found"
  // rather than "forbidden", which would confirm the customer exists.
  const scope = customerScopeFilter({
    role: auth.effectiveRole, userId: auth.profile.id, region: auth.profile.region,
  })
  let cq = supabase
    .from('customers').select('id, company_name, billing_address, is_active')
    .eq('id', customer_id).eq('tenant_id', tenantId)
  if (scope) cq = cq.eq(scope.column, scope.value)
  const { data: customer, error: cErr } = await cq.maybeSingle()
  if (cErr) return NextResponse.json({ error: 'Could not load customer' }, { status: 500 })
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  // Candidate orders: finished, this customer's, this tenant's.
  let oq = supabase
    .from('orders')
    .select('id, order_number, type, final_amount, quoted_amount, total_amount, currency, completed_at')
    .eq('tenant_id', tenantId).eq('customer_id', customer_id)
    .in('status', BILLABLE_STATUSES)
  if (order_ids?.length) oq = oq.in('id', order_ids)
  const { data: orders, error: oErr } = await oq
  if (oErr) {
    console.error('customer-invoices: order lookup failed', oErr)
    return NextResponse.json({ error: 'Could not load orders' }, { status: 500 })
  }

  // Exclude orders already on an invoice for this tenant. The unique index
  // enforces this too; checking here produces a useful message instead of a
  // constraint violation.
  const { data: already } = await supabase
    .from('customer_invoice_line_items').select('order_id').eq('tenant_id', tenantId).not('order_id', 'is', null)
  const invoiced = new Set((already ?? []).map((l) => l.order_id as string))
  const candidates = (orders ?? []).filter((o) => !invoiced.has(o.id as string)) as BillableOrder[]

  const draft = buildInvoiceDraft({
    orders: candidates,
    billingAddress: customer.billing_address as Record<string, unknown> | null,
    currency: candidates[0]?.currency ?? 'CAD',
    taxable,
  })
  if (draft.lines.length === 0) {
    return NextResponse.json(
      { error: 'Nothing to invoice — these orders are already invoiced, unfinished, or carry no amount.' },
      { status: 400 },
    )
  }

  const year = new Date().getUTCFullYear()
  const { data: seq, error: seqErr } = await supabase.rpc('next_customer_invoice_seq', { p_tenant_id: tenantId, p_year: year })
  if (seqErr) {
    console.error('customer-invoices: numbering failed', seqErr)
    return NextResponse.json({ error: 'Could not allocate an invoice number' }, { status: 500 })
  }

  const dueDate = due_days !== undefined
    ? new Date(Date.now() + due_days * 86_400_000).toISOString().slice(0, 10)
    : null

  const { data: invoice, error: iErr } = await supabase
    .from('customer_invoices')
    .insert({
      tenant_id: tenantId,
      customer_id,
      invoice_number: formatCustomerInvoiceNumber(year, Number(seq)),
      status: 'draft',
      due_date: dueDate,
      subtotal: draft.subtotal,
      tax_rate: draft.taxRate,
      tax_label: draft.taxLabel,
      tax_amount: draft.taxAmount,
      total: draft.total,
      currency: draft.currency,
      notes: notes ?? null,
      created_by: auth.profile.id,
    })
    .select()
    .single()
  if (iErr || !invoice) {
    console.error('customer-invoices: insert failed', iErr)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }

  const { error: lErr } = await supabase.from('customer_invoice_line_items').insert(
    draft.lines.map((l) => ({ ...l, invoice_id: invoice.id, tenant_id: tenantId })),
  )
  if (lErr) {
    // Don't leave a total with no lines behind — roll the header back.
    await supabase.from('customer_invoices').delete().eq('id', invoice.id)
    console.error('customer-invoices: line insert failed, invoice rolled back', lErr)
    const duplicate = lErr.code === '23505'
    return NextResponse.json(
      { error: duplicate ? 'One of those orders was invoiced by another request just now. Reload and try again.' : 'Failed to create invoice lines' },
      { status: duplicate ? 409 : 500 },
    )
  }

  return NextResponse.json({ data: { ...invoice, lines: draft.lines } }, { status: 201 })
}
